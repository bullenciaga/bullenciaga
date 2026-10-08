/** Exact pixel placement for the current AS Colour 5080 full front region.
 * No resize, interpolation or AI changes. Bounded PNG8 RGB/RGBA only. */
const SIGNATURE=new Uint8Array([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0}
const review=()=>{throw new Error('Unsupported print PNG; requires manual print preparation')};
function chunk(type,data){const b=new Uint8Array(data.length+12),v=new DataView(b.buffer);v.setUint32(0,data.length);for(let i=0;i<4;i++)b[4+i]=type.charCodeAt(i);b.set(data,8);v.setUint32(b.length-4,crc(b.subarray(4,b.length-4)));return b}
function concat(parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length}return result}
async function inflateExact(stream,size){const r=stream.getReader(),out=new Uint8Array(size);let offset=0;try{while(true){const x=await r.read();if(x.done)break;if(offset+x.value.length>size){await r.cancel();review()}out.set(x.value,offset);offset+=x.value.length}if(offset!==size)review();return out}finally{r.releaseLock()}}
async function pngDataChunks(stream,max){const r=stream.getReader(),parts=[];let length=0;try{while(true){const x=await r.read();if(x.done)break;length+=x.value.length;if(length>max){await r.cancel();review()}parts.push(chunk('IDAT',x.value))}return parts}finally{r.releaseLock()}}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c}
/** Validates CRC, limits inflated bytes, rejects unsupported colour/interlace. */
export async function decodePrintPNG(bytes,{maxSide=2600}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length>20000000||!SIGNATURE.every((b,i)=>bytes[i]===b))review();
 let width,height,channels,stride,ended=false;const idat=[],profiles=[];
 for(let p=8;p+12<=bytes.length;){
  const view=new DataView(bytes.buffer,bytes.byteOffset+p,bytes.length-p),length=view.getUint32(0);if(length>bytes.length-p-12)review();
  const type=String.fromCharCode(...bytes.subarray(p+4,p+8)),data=bytes.subarray(p+8,p+8+length);
  if(crc(bytes.subarray(p+4,p+8+length))!==view.getUint32(8+length))review();
  if(type==='IHDR'){
   if(width||p!==8||length!==13)review();const header=new DataView(data.buffer,data.byteOffset,data.length);width=header.getUint32(0);height=header.getUint32(4);
   if(!width||!height||width>maxSide||height>maxSide||data[8]!==8||![2,6].includes(data[9])||data[10]||data[11]||data[12])review();channels=data[9]===6?4:3;stride=width*channels;
  }else if(type==='IDAT'){if(!width)review();idat.push(data)}
  else if(['sRGB','gAMA','cHRM','iCCP'].includes(type)){if(length>1000000)review();profiles.push(chunk(type,data))}
  else if(type==='IEND'){if(length!==0)review();ended=true;break}
  else if(type==='tRNS'||type==='acTL'||type==='PLTE'||/^[A-Z]/.test(type))review();
  p+=length+12;
 }
 if(!ended||!idat.length)review();
 const expected=(stride+1)*height,rows=await inflateExact(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate')),expected);if(rows.length!==expected)review();
 for(let y=0;y<height;y++){
  const start=y*(stride+1),filter=rows[start];if(filter>4)review();
  for(let x=0;x<stride;x++){
   const i=start+1+x,a=x>=channels?rows[i-channels]:0,b=y?rows[i-stride-1]:0,c=y&&x>=channels?rows[i-stride-1-channels]:0;
   if(filter===1)rows[i]=(rows[i]+a)&255;
   else if(filter===2)rows[i]=(rows[i]+b)&255;
   else if(filter===3)rows[i]=(rows[i]+((a+b)>>>1))&255;
   else if(filter===4)rows[i]=(rows[i]+paeth(a,b,c))&255;
  }
 }
 return {width,height,channels,stride,rows,profiles};
}
/** Region dimensions are from the live supplier template, never a client value. */
export async function makeSquarePrintCanvas(asset,dimensions){
 if(asset.width!==asset.height||asset.width<1024||asset.width>2600||asset.contentType!=='image/png')review();
 if(dimensions?.inchesWidth!==15.5||dimensions?.inchesHeight!==19.6)review();
 const source=await decodePrintPNG(asset.bytes);if(source.width!==asset.width||source.height!==asset.height)review();
 const small=source.width<1800,inch=small?source.width/150:12.6;
 const dpi=source.width/inch,width=Math.round(dimensions.inchesWidth*dpi),height=Math.round(dimensions.inchesHeight*dpi);
 // Center horizontally; place top one inch below the front print-region top.
 const x=Math.floor((width-source.width)/2),y=Math.round(dpi);if(x<0||y+source.height>height)review();
 let row=0;const raw=new ReadableStream({pull(controller){
  if(row>=height){controller.close();return}
  const out=new Uint8Array(width*4+1),sy=row-y;
  if(sy>=0&&sy<source.height){const input=source.rows.subarray(sy*(source.stride+1)+1,(sy+1)*(source.stride+1));
   if(source.channels===4)out.set(input,1+x*4);
   else for(let sx=0;sx<source.width;sx++){const d=1+(x+sx)*4,s=sx*3;out[d]=input[s];out[d+1]=input[s+1];out[d+2]=input[s+2];out[d+3]=255}
  }
  row++;controller.enqueue(out);
 }});
 const data=await pngDataChunks(raw.pipeThrough(new CompressionStream('deflate')),20000000);
 const header=new Uint8Array(13),v=new DataView(header.buffer);v.setUint32(0,width);v.setUint32(4,height);header[8]=8;header[9]=6;
 const physical=new Uint8Array(9),pv=new DataView(physical.buffer);pv.setUint32(0,Math.round(dpi/0.0254));pv.setUint32(4,Math.round(dpi/0.0254));physical[8]=1;
 const bytes=concat([SIGNATURE,chunk('IHDR',header),...source.profiles,chunk('pHYs',physical),...data,chunk('IEND',new Uint8Array())]);
 const physicalInches=source.width/width*dimensions.inchesWidth,cm=Math.round(physicalInches*2.54*10)/10;
 return {...asset,bytes,width,height,placementStrategy:'FULL_REGION',printInfo:{widthInches:Number(physicalInches.toFixed(2)),widthCm:cm,sourcePixels:source.width,dpi:Math.round(source.width/physicalInches),small,upscaled:false,pixelOffset:{x,y},canvasPixels:{width,height}},printMessage:`Square front print: approximately ${cm} × ${cm} cm. Original ${source.width}px artwork at about ${Math.round(source.width/physicalInches)} dpi, with no image upscaling.`};
}
