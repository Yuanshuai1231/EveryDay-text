const cloud=process.env.CHECKIN_STORAGE==="supabase"||Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const names=cloud?["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]:[];
console.log(cloud?"存储模式：Supabase":"存储模式：本地 PostgreSQL");
let missing=false;
for(const name of names){const present=Boolean(process.env[name]);console.log(name+": "+(present?"已配置":"缺失"));missing ||= !present;}
process.exitCode=missing?1:0;

