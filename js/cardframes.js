// Fame Collector Cards: real jewel-like SVG frames for 10 existing classes.
// This module changes visuals only: order, thresholds and 3D stones remain in data.js.
import { CLASSES } from './data.js';
const METALS=[["#445260","#a7b3bf","#f6fbff","#697683"],["#075449","#37c8a2","#e4fff4","#137d6c"],["#105270","#42cbea","#eeffff","#187d9d"],["#0f2b83","#3e74f2","#edf3ff","#1d48ae"],["#53217d","#af54fa","#ffe5ff","#7531af"],["#6f184c","#f071af","#ffe9f3","#a83275"],["#660c1e","#eb334c","#ffdfcf","#af1d33"],["#8c3009","#ff8c22","#fff0bd","#cc5413"],["#774807","#e7b748","#fff8d5","#b57b16"],["#7f81c1","#a7dffe","#fffafa","#f9c0e9"]];
let uid=0;
function gem(x,y,r,id){
const top=y-r,bottom=y+r,left=x-r,right=x+r;
return `<g><path d="M${x} ${top}L${right} ${y}L${x} ${bottom}L${left} ${y}Z" fill="url(#${id}g)" stroke="url(#${id}l)" stroke-width="1.2"/><path d="M${x} ${top}V${bottom}M${left} ${y}H${right}" stroke="#fff" stroke-opacity=".7" stroke-width=".8"/><path d="M${x} ${top}L${x+r*.3} ${y}L${left} ${y}Z" fill="#fff" opacity=".43"/><path d="M${x} ${bottom}L${right} ${y}L${x+r*.3} ${y}Z" fill="#04152a" opacity=".42"/></g>`;
}

function corner(k,id){
 if(k===0)return `<path d="M15 48V24L24 15H50" stroke="url(#${id}l)" stroke-width="1.4" fill="none"/>`;
 let p=`<path d="M7 51V23L23 7H55L42 18H26L18 26V42Z" fill="url(#${id}m)" stroke="url(#${id}l)" stroke-width="1.4"/><path d="M10 50V25L25 10H54" stroke="#fff" stroke-opacity=".85" stroke-width="1.4" fill="none"/>`;
 if(k>=3)p+=`<path d="M17 39L17 27L27 17H42" stroke="url(#${id}l)" stroke-width="1.5" fill="none"/>`;
 if(k>=4)p+=`<path d="M28 13Q23 30 46 35M13 28Q30 24 35 46" fill="none" stroke="url(#${id}l)" stroke-width="1.4"/>`;
 if(k>=6)p+=gem(25,25,k>=8?10:6,id);
 if(k>=8)p+=`<path d="M4 61V26L26 4H61M11 58V29L29 11H58" fill="none" stroke="url(#${id}l)" stroke-width="1.5"/>`;
 return p;
}

function collectorFrameSvg(classIndex){
 const i=Math.max(0,Math.min(9,Number(classIndex)||0)),[dark,mid,light,shade]=METALS[i],id="fameframe"+(uid++),holo=i===9;
 const colors=holo?["#ffdfef","#a8efff","#fff0b9","#b9ffe9","#e9cfff","#fff","#ffdfef"]:[dark,light,mid,shade,light,mid,light,dark];
 const stops=colors.map((c,n)=>`<stop offset="${(n/(colors.length-1)*100).toFixed(1)}%" stop-color="${c}"/>`).join("");
 const cg=corner(i,id);
 const corners=`<g>${cg}</g><g transform="translate(300 0) scale(-1 1)">${cg}</g><g transform="translate(0 430) scale(1 -1)">${cg}</g><g transform="translate(300 430) scale(-1 -1)">${cg}</g>`;
 const rings=i===0?4:i<3?5:i<6?6:i<8?7:9;
 let extra="";
 if(i>=2)extra+=`<path d="M11 82V164M289 82V164M11 267V349M289 267V349" stroke="url(#${id}l)" stroke-width="${i>=6?2.3:1.2}" opacity=".72"/>`;
 if(i>=3)extra+=`<path d="M11 118L18 129L11 140M289 118L282 129L289 140M11 292L18 303L11 314M289 292L282 303L289 314" stroke="url(#${id}m)" stroke-width="3" fill="none"/>`;
 if(i>=4)extra+=`<path d="M65 10L94 10L105 17M235 10L206 10L195 17M65 420L94 420L105 413M235 420L206 420L195 413" stroke="url(#${id}l)" stroke-width="1.2" fill="none"/>`;
 if(i>=5)extra+=gem(150,12,i>=8?15:i>=7?11:7,id)+gem(150,418,i>=8?15:i>=7?11:7,id);
 if(i>=6)extra+=gem(10,215,i>=8?11:7,id)+gem(290,215,i>=8?11:7,id);
 if(i>=7)extra+=`<path d="M43 10Q65 19 87 13M257 10Q235 19 213 13M43 420Q65 411 87 417M257 420Q235 411 213 417" stroke="${light}" stroke-width="1.8" fill="none" opacity=".85"/><path d="M18 75Q30 89 18 104M282 75Q270 89 282 104M18 326Q30 341 18 355M282 326Q270 341 282 355" stroke="url(#${id}l)" stroke-width="1.6" fill="none"/>`;
 if(i>=8)extra+=`<path d="M110 10H133L150 4L167 10H190M110 420H133L150 426L167 420H190" stroke="${light}" stroke-width="2.4" fill="none"/>`;
 if(holo)extra+=`<path d="M7 90V50L30 27M293 90V50L270 27M7 340V380L30 403M293 340V380L270 403" stroke="url(#${id}m)" stroke-width="5" fill="none"/>`;
 return `<svg class="famecard-collectors-frame fameframe-${i}" viewBox="0 0 300 430" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
 <defs>
 <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
 <linearGradient id="${id}l" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${shade}"/><stop offset=".23" stop-color="${light}"/><stop offset=".52" stop-color="${mid}"/><stop offset=".74" stop-color="#fff"/><stop offset="1" stop-color="${dark}"/></linearGradient>
 <radialGradient id="${id}g" cx=".28" cy=".2" r=".9"><stop stop-color="#fff"/><stop offset=".24" stop-color="${light}"/><stop offset=".64" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
 <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${i>=8?4:2}"/></filter>
 </defs>
 <rect x="4" y="4" width="292" height="422" rx="18" fill="none" stroke="${mid}" stroke-width="${rings+3}" opacity="${i===0?.28:.53}" filter="url(#${id}blur)"/>
 <rect x="5" y="5" width="290" height="420" rx="16.5" fill="none" stroke="url(#${id}m)" stroke-width="${rings}"/>
 <rect x="8.5" y="8.5" width="283" height="413" rx="12.5" fill="none" stroke="${light}" stroke-width="${i>=7?1.7:.9}" opacity=".88"/>
 <rect x="12" y="12" width="276" height="406" rx="11" fill="none" stroke="${dark}" stroke-width="1.6" opacity=".88"/>
 ${i>=3?`<rect x="15" y="15" width="270" height="400" rx="10" fill="none" stroke="url(#${id}l)" stroke-width="${i>=7?2:1}" opacity=".66"/>`:''}
 <path d="M26 7H100M200 7H274M26 423H100M200 423H274" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>
 ${corners}${extra}
 ${i>=5?`<path class="fameframe-glint" d="M28 7H270M293 31V398M270 423H28M7 398V31" stroke="#fff" stroke-width="${holo?1.8:1}" stroke-dasharray="${holo?'12 14':'3 56'}" stroke-linecap="round" fill="none" opacity=".68"/>`:''}
 </svg>`;
}

function collectorGemThumbnailSvg(tier){
 const id="famegem"+(uid++);
 const c=String(tier?.tone||tier?.c||"#96dbf7").replace(/[^#a-fA-F0-9]/g,"");
 const cut=String(tier?.cut||"round");
 const path=/emerald|asscher|radiant|octagon|step|princess/.test(cut)?"M57 19L162 19L184 43L184 101L161 124H58L35 101V44Z":/pear/.test(cut)?"M160 17Q182 43 180 81Q174 121 125 130Q54 144 39 92Q30 46 160 17Z":/marquise/.test(cut)?"M17 76Q96 6 205 74Q110 140 17 76Z":/cabochon|rough/.test(cut)?"M48 42Q71 10 127 22Q187 19 192 70Q198 115 147 125L71 120Q31 109 32 77Z":"M35 65Q40 18 108 14Q182 15 192 69Q187 120 118 133Q47 128 35 65Z";
 return `<svg class="collector-gem-thumbnail" viewBox="0 0 220 148" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
 <defs><radialGradient id="${id}r" cx=".32" cy=".19" r=".8"><stop stop-color="#fff"/><stop offset=".23" stop-color="${c}"/><stop offset=".68" stop-color="${c}"/><stop offset="1" stop-color="#091021"/></radialGradient>
 <clipPath id="${id}p"><path d="${path}"/></clipPath></defs>
 <ellipse cx="111" cy="135" rx="71" ry="8" fill="${c}" opacity=".35"/>
 <g transform="rotate(-7 110 73)">
 <path d="${path}" fill="url(#${id}r)" stroke="#fff" stroke-opacity=".8" stroke-width="1.8"/>
 <g clip-path="url(#${id}p)" stroke="#fff" stroke-opacity=".40">
 <path d="M20 21L103 62L44 112Z" fill="#fff" opacity=".29"/><path d="M192 21L103 62L188 113Z" fill="#091427" opacity=".4"/>
 <path d="M103 62L55 130H155Z" fill="#fff" opacity=".15"/><path d="M103 62L116 4L173 35Z" fill="#fff" opacity=".32"/>
 <path d="M44 20L103 62L182 19M19 76L103 62L204 77M55 134L103 62L173 134M103 62V2" fill="none"/>
 <path d="M44 56L95 41L118 66L89 99Z" fill="#fff" opacity=".23"/>
 </g><path d="M66 39L95 33L112 38" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
 </g></svg>`;
}
export { collectorFrameSvg, collectorGemThumbnailSvg };
