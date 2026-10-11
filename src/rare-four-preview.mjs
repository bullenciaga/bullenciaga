// Isolated campaign service, reached through the existing website route.
// Staging exposes public reads only; production forwards only the protected start.
export function rareFourPreviewRead(request,env){
 const url=new URL(request.url);
 const staging=url.hostname==='bullenciaga-staging.bullenciaga-e5c.workers.dev';
 const production=['bullenciaga.com','www.bullenciaga.com'].includes(url.hostname);
 if((!staging&&!production)||!url.pathname.startsWith('/rare-four-api/'))return null;
 const path=url.pathname.slice('/rare-four-api'.length);
 const read=request.method==='GET'&&['/status','/rules','/entries','/snapshot','/results'].includes(path);
 const start=production&&request.method==='POST'&&path==='/start';
 if(!read&&!start)return new Response('Not found',{status:404});
 if(!env?.RARE_FOUR_API)return new Response('Campaign unavailable',{status:503});
 const target='https://'+(staging?'bullenciaga-rare-four-staging':'bullenciaga-rare-four')+'.bullenciaga-e5c.workers.dev'+path+url.search;
 const forwarded=new Request(target,request);
 for(const key of [...forwarded.headers.keys()])forwarded.headers.delete(key);
 forwarded.headers.set('Accept','application/json');
 if(start)for(const key of ['Authorization','Content-Type','Origin']){const value=request.headers.get(key);if(value)forwarded.headers.set(key,value);}
 return env.RARE_FOUR_API.fetch(forwarded);
}
