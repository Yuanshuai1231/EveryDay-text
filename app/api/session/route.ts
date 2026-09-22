import { getCurrentSession } from "@/lib/auth/session";
export async function GET(){
 try { const session=await getCurrentSession(); return Response.json({spaceId:session?.space_id??null}); }
 catch { return Response.json({spaceId:null}); }
}

