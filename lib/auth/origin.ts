/** Compare the browser origin with the actual HTTP authority. Next may normalize
 * request.url to localhost behind a development server or reverse proxy. */
export function hasSameOrigin(request:Request):boolean{
 if(request.headers.get("sec-fetch-site")==="cross-site")return false;
 const origin=request.headers.get("origin");
 if(!origin)return true;
 try{
  const parsed=new URL(origin);
  const actualHost=request.headers.get("host")??new URL(request.url).host;
  return ["http:","https:"].includes(parsed.protocol)&&parsed.host===actualHost;
 }catch{return false;}
}

