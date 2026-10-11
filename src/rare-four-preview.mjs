// Staging has no custom-domain route. Forward only the coordinator's public
// reads to its isolated staging instance; never proxy an activation or write.
export function rareFourPreviewRead(request,fetcher=fetch){
 const url=new URL(request.url);
 if(url.hostname!=='bullenciaga-staging.bullenciaga-e5c.workers.dev'||!url.pathname.startsWith('/rare-four-api/'))return null;
 const path=url.pathname.slice('/rare-four-api'.length);
 if(request.method!=='GET'||!['/status','/rules','/entries','/snapshot','/results'].includes(path))return new Response('Not found',{status:404});
 return fetcher('https://bullenciaga-rare-four-staging.bullenciaga-e5c.workers.dev'+path+url.search,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
}
