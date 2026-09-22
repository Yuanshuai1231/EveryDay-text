import { getLocalDatabase } from "./database";
import type { PGlite } from "@electric-sql/pglite";

const tables = new Set(["spaces", "members", "member_sessions", "daily_logs", "daily_checkins", "tasks", "conversations", "conversation_members", "messages"]);
const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Invalid SQL identifier");
  return '"' + value + '"';
};
function splitTop(value: string) {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    if (value[i] === "," && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start)); return parts;
}
export function makeLocalFetch(database: () => Promise<PGlite> = getLocalDatabase): typeof fetch {
  return async (input, init) => {
    try {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const db = await database();
      const query = <T>(sql: string, params: unknown[]) => db.query<T>(sql, params, { parsers: {
        1082: (value: string) => value,
        1184: (value: string) => value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"),
        1114: (value: string) => value.replace(" ", "T"),
      } });
      const parameters: unknown[] = [];
      const bind = (value: unknown) => { parameters.push(value); return "$" + parameters.length; };
      const resource = requestUrl.pathname.split("/rest/v1/")[1];
      let rows: Record<string, unknown>[]; let total: number | undefined;
      if (resource?.startsWith("rpc/")) {
        const fn = identifier(resource.slice(4));
        const args = Object.entries(body ?? {}).map(([key, value]) => identifier(key) + " => " + bind(value));
        const result = await query<Record<string, unknown>>("SELECT * FROM public." + fn + "(" + args.join(",") + ")", parameters);
        rows = result.rows;
        if (["is_active_member", "can_read_conversation", "can_send_message", "is_valid_timezone"].includes(resource.slice(4))) {
          return Response.json(rows[0]?.[resource.slice(4)] ?? null);
        }
      } else {
        if (!tables.has(resource)) return Response.json({code:"42P01",message:"Unknown table"}, {status:404});
        const table = "public." + identifier(resource);
        const search = requestUrl.searchParams;
        const condition = (column: string, operatorValue: string): string => {
          const col = identifier(column);
          if (operatorValue.startsWith("not.")) return "NOT (" + condition(column, operatorValue.slice(4)) + ")";
          const dot = operatorValue.indexOf(".");
          const operator = operatorValue.slice(0, dot), value = operatorValue.slice(dot + 1);
          if (operator === "is") {
            if (!["null", "true", "false"].includes(value)) throw new Error("Invalid IS value");
            return col + " IS " + value.toUpperCase();
          }
          if (operator === "in") {
            const values = splitTop(value.slice(1,-1)).filter(Boolean).map((v) => v.replace(/^"|"$/g, ""));
            return values.length ? col + " IN (" + values.map(bind).join(",") + ")" : "FALSE";
          }
          const operators: Record<string,string> = {eq:"=",neq:"<>",gt:">",gte:">=",lt:"<",lte:"<=",like:"LIKE",ilike:"ILIKE"};
          if (!operators[operator]) throw new Error("Unsupported filter operator " + operator);
          return col + " " + operators[operator] + " " + bind(value);
        };
        const logic = (expression: string): string => {
          if (expression.startsWith("and(") || expression.startsWith("or(")) {
            const index = expression.indexOf("(");
            return "(" + splitTop(expression.slice(index+1,-1)).map(logic).join(expression.startsWith("and") ? " AND " : " OR ") + ")";
          }
          const dot = expression.indexOf(".");
          return condition(expression.slice(0,dot), expression.slice(dot+1));
        };
        const filters: string[] = [];
        const ignored = new Set(["select","order","limit","offset","on_conflict","columns"]);
        for (const [column,value] of search) {
          if (ignored.has(column)) continue;
          filters.push(column === "or" || column === "and" ? logic(column+value) : condition(column,value));
        }
        const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
        const select = search.get("select") ?? "*";
        if (select.includes("(") || select.includes("!")) throw new Error("Use separate queries instead of embedded relations in local mode");
        const fields = select === "*" ? "*" : select.split(",").map(identifier).join(",");
        const order = search.get("order");
        const orderSql = order ? " ORDER BY " + order.split(",").map((part) => {
          const [col,dir,nulls] = part.split(".");
          return identifier(col) + (dir === "desc" ? " DESC" : " ASC") + (nulls === "nullsfirst" ? " NULLS FIRST" : " NULLS LAST");
        }).join(",") : "";
        const number = (v: string | null, fallback: number) => v !== null && /^\d+$/.test(v) ? Math.min(Number(v),100000) : fallback;
        const limitSql = " LIMIT " + number(search.get("limit"),10000) + " OFFSET " + number(search.get("offset"),0);
        if (method === "GET" || method === "HEAD") {
          const result = await query<Record<string, unknown>>("SELECT "+fields+" FROM "+table+where+orderSql+limitSql,parameters);
          rows = result.rows;
          if (headers.get("prefer")?.includes("count=exact")) {
            const count = await query<{count:number}>("SELECT count(*)::int AS count FROM "+table+where, parameters);
            total=count.rows[0].count;
          }
        } else if (method === "POST") {
          const items = Array.isArray(body) ? body : [body];
          if (!items.length) return Response.json([]);
          const keys = Object.keys(items[0]);
          const values = items.map((item) => "(" + keys.map((key) => bind(item[key])).join(",") + ")").join(",");
          let conflict = "";
          if (headers.get("prefer")?.includes("resolution=")) {
            const keyNames = (search.get("on_conflict") ?? "id").split(",");
            const updatedKeys = keys.filter((k)=>!keyNames.includes(k));
            conflict = " ON CONFLICT ("+keyNames.map(identifier).join(",")+") ";
            conflict += headers.get("prefer")?.includes("ignore-duplicates") || !updatedKeys.length ? "DO NOTHING" : "DO UPDATE SET "+updatedKeys.map((k)=>identifier(k)+"=EXCLUDED."+identifier(k)).join(",");
          }
          rows=(await query<Record<string,unknown>>("INSERT INTO "+table+" ("+keys.map(identifier).join(",")+") VALUES "+values+conflict+" RETURNING "+fields,parameters)).rows;
        } else if (method === "PATCH") {
          const assignments=Object.entries(body).map(([key,value])=>identifier(key)+"="+bind(value)).join(",");
          rows=(await query<Record<string,unknown>>("UPDATE "+table+" SET "+assignments+where+" RETURNING "+fields,parameters)).rows;
        } else if (method === "DELETE") {
          rows=(await query<Record<string,unknown>>("DELETE FROM "+table+where+" RETURNING "+fields,parameters)).rows;
        } else return Response.json({message:"Unsupported method"},{status:405});
      }
      const outHeaders = new Headers({"content-type":"application/json"});
      if (total !== undefined) outHeaders.set("content-range","0-"+Math.max(rows.length-1,0)+"/"+total);
      if (headers.get("accept")?.includes("application/vnd.pgrst.object+json")) {
        if (rows.length !== 1) return Response.json({code:"PGRST116",message:"JSON object requested, multiple (or no) rows returned",details:"The result contains "+rows.length+" rows"}, {status:406});
        return Response.json(rows[0],{headers:outHeaders});
      }
      return new Response(method==="HEAD"?null:JSON.stringify(rows),{status:200,headers:outHeaders});
    } catch (error) {
      const failure = error as {code?:string;message?:string;detail?:string};
      return Response.json({code:failure.code??"LOCAL_DB_ERROR",message:failure.message??"Database error",details:failure.detail??null},{status:400});
    }
  };
}
