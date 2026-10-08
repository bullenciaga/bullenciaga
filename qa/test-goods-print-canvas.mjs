import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync,inflateSync} from 'node:zlib';
import {decodePrintPNG,makeSquarePrintCanvas} from '../src/goods-print-canvas.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1}return(c^0xffffffff)>>>0}
function chunk(name,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out}
function paeth(a,b,c){const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c}
function png(width,height,channels=4,filters=[0]){
 const pixels=Buffer.alloc(width*height*channels);for(let i=0;i<pixels.length;i++)pixels[i]=(i*13+(i>>8))&255;
 const stride=width*channels,raw=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++){const filter=filters[y%filters.length];raw[y*(stride+1)]=filter;for(let x=0;x<stride;x++){const p=y*stride+x,a=x>=channels?pixels[p-channels]:0,b=y?pixels[p-stride]:0,c=y&&x>=channels?pixels[p-stride-channels]:0;const predicted=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];raw[y*(stride+1)+1+x]=(pixels[p]-predicted)&255}}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;
 const bytes=Buffer.concat([signature,chunk('IHDR',header),chunk('sRGB',Buffer.from([0])),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);return{bytes,pixels,width,height,contentType:'image/png'};
}
function rawOutput(bytes){const data=[],types=[];let w,h;for(let p=8;p<bytes.length;){const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);types.push(type);assert.equal(b.readUInt32BE(p+8+n),crc(b.subarray(p+4,p+8+n)));if(type==='IHDR'){w=b.readUInt32BE(p+8);h=b.readUInt32BE(p+12)}if(type==='IDAT')data.push(b.subarray(p+8,p+8+n));p+=n+12}return{raw:inflateSync(Buffer.concat(data)),w,h,types}}
test('PNG decoder preserves RGB/RGBA pixels for every standard PNG row filter',async()=>{
 for(const channels of[3,4]){const source=png(11,10,channels,[0,1,2,3,4]),d=await decodePrintPNG(source.bytes);assert.equal(d.channels,channels);for(let y=0;y<10;y++)assert.deepEqual(Buffer.from(d.rows.subarray(y*(d.stride+1)+1,(y+1)*(d.stride+1))),source.pixels.subarray(y*d.stride,(y+1)*d.stride))}
});
test('1024px source becomes a32cm square with original pixels, honest resolution and transparent placement padding',async()=>{
 const source=png(1024,1024),p=await makeSquarePrintCanvas(source,{inchesWidth:15.5,inchesHeight:19.6}),o=rawOutput(p.bytes);assert.equal(p.placementStrategy,'FULL_REGION');assert.equal(p.printInfo.widthCm,32);assert.equal(p.printInfo.dpi,81);assert.equal(p.printInfo.lowResolution,true);assert.equal(p.printInfo.small,false);assert.equal(p.printInfo.upscaled,false);assert.match(p.printMessage,/Fine detail may look softer/);assert.equal(o.w,1260);assert.equal(o.h,1593);assert.ok(o.types.includes('sRGB'));const stride=o.w*4+1,{x,y}=p.printInfo.pixelOffset;
 for(let r=0;r<o.h;r++){assert.equal(o.raw[r*stride],0);if(r>=y&&r<y+1024){assert.deepEqual(o.raw.subarray(r*stride+1+x*4,r*stride+1+(x+1024)*4),source.pixels.subarray((r-y)*4096,(r-y+1)*4096));assert.ok(o.raw.subarray(r*stride+1,r*stride+1+x*4).every(v=>v===0));assert.ok(o.raw.subarray(r*stride+1+(x+1024)*4,(r+1)*stride).every(v=>v===0))}else assert.ok(o.raw.subarray(r*stride+1,(r+1)*stride).every(v=>v===0))}
});
test('higher-resolution RGB artwork retains original pixels at32cm and opaque art alpha',async()=>{
 const source=png(1800,1800,3),p=await makeSquarePrintCanvas(source,{inchesWidth:15.5,inchesHeight:19.6}),o=rawOutput(p.bytes),{x,y}=p.printInfo.pixelOffset;assert.equal(p.printInfo.widthCm,32);assert.equal(p.printInfo.small,false);for(const [px,py]of[[0,0],[899,900],[1799,1799]]){const i=(py+y)*(o.w*4+1)+1+(px+x)*4,s=(py*1800+px)*3;assert.deepEqual(o.raw.subarray(i,i+3),source.pixels.subarray(s,s+3));assert.equal(o.raw[i+3],255)}
});
test('all eligible resolutions use the same physical size; softness disclosure tracks effective source DPI',async()=>{
 for(const size of[1500,1900,2512]){const p=await makeSquarePrintCanvas(png(size,size,3),{inchesWidth:15.5,inchesHeight:19.6});assert.equal(p.printInfo.widthCm,32);assert.equal(p.printInfo.sourcePixels,size);assert.equal(p.printInfo.upscaled,false);assert.equal(p.printInfo.lowResolution,size<1890);assert.equal(/may look softer/.test(p.printMessage),p.printInfo.lowResolution);assert.ok(Math.abs(p.printInfo.widthInches-12.6)<=0.01)}
});
test('corruption, oversized source, unknown template dimensions and unsafe formats fail before upload',async()=>{
 const source=png(1024,1024),corrupt=Buffer.from(source.bytes);corrupt[45]^=1;await assert.rejects(()=>decodePrintPNG(corrupt));await assert.rejects(()=>makeSquarePrintCanvas({...source,width:2601,height:2601},{inchesWidth:15.5,inchesHeight:19.6}));await assert.rejects(()=>makeSquarePrintCanvas(source,{inchesWidth:16,inchesHeight:20}));await assert.rejects(()=>makeSquarePrintCanvas({...source,contentType:'image/jpeg'},{inchesWidth:15.5,inchesHeight:19.6}));
 const bomb=png(10,10),header=Buffer.from(bomb.bytes.subarray(16,29));header.writeUInt32BE(1);header.writeUInt32BE(1,4);const big=Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(100000))),chunk('IEND',Buffer.alloc(0))]);await assert.rejects(()=>decodePrintPNG(big));
});
