// Fame Collector Cards: real jewel-like SVG frames for 10 existing classes.
// This module changes visuals only: order, thresholds and 3D stones remain in data.js.
import { CLASSES } from './data.js';
const METALS=[["#424b57","#82909c","#e0e4e8","#626f79"],["#315a55","#7fae9e","#dfede7","#547f71"],["#28586a","#73aaba","#e1eff2","#4d8293"],["#223869","#6889ba","#d9e5f8","#3f659f"],["#49345b","#9878ac","#e5d8ef","#795c94"],["#713b56","#b5839f","#f1dfe6","#936581"],["#631c2d","#b74652","#f5c9c8","#872c3a"],["#773811","#c07734","#ffe0ac","#a55221"],["#715013","#cb9f3e","#fff2c7","#a67d26"],["#747d9b","#b2d7e7","#fff8ff","#d8b2e6"]];
let uid=0;
function gem(x,y,r,id){
const top=y-r,bottom=y+r,left=x-r,right=x+r;
return `<g><path d="M${x} ${top}L${right} ${y}L${x} ${bottom}L${left} ${y}Z" fill="url(#${id}g)" stroke="url(#${id}l)" stroke-width="1.2"/><path d="M${x} ${top}V${bottom}M${left} ${y}H${right}" stroke="#fff" stroke-opacity=".7" stroke-width=".8"/><path d="M${x} ${top}L${x+r*.3} ${y}L${left} ${y}Z" fill="#fff" opacity=".43"/><path d="M${x} ${bottom}L${right} ${y}L${x+r*.3} ${y}Z" fill="#04152a" opacity=".42"/></g>`;
}

function corner(k,id){
 if(k===0)return `<path d="M17 44V24L24 17H43" fill="none" stroke="url(#${id}l)" stroke-width="1.1" opacity=".78"/>`;
 let p=`<path d="M10 43V24L24 10H43L34 17H27L17 27V35Z" fill="url(#${id}m)" stroke="url(#${id}l)" stroke-opacity=".85" stroke-width=".85"/><path d="M14 42V26L26 14H42" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width=".85"/>`;
 if(k>=2)p+=`<path d="M7 49V24L24 7H49" stroke="url(#${id}l)" stroke-opacity=".66" stroke-width="1" fill="none"/>`;
 if(k>=3)p+=`<path d="M22 11L32 16L18 32L11 21Z" fill="url(#${id}m)" opacity=".66"/>`;
 if(k>=4)p+=`<path d="M25 16Q19 30 38 34M16 25Q30 20 34 38" fill="none" stroke="url(#${id}l)" stroke-width=".9" opacity=".65"/>`;
 if(k>=5)p+=`<path d="M26 17L32 25L26 33L20 25Z" stroke="url(#${id}l)" stroke-width=".8" fill="none" opacity=".86"/><circle cx="26" cy="25" r="1.5" fill="#fff" fill-opacity=".68"/>`;
 if(k>=6)p+=gem(25,25,k>=8?7:5,id);
 if(k>=7)p+=`<path d="M5 55V24L24 5H55" fill="none" stroke="url(#${id}l)" stroke-width="1.4" opacity=".83"/>`;
 if(k>=8)p+=`<path d="M9 44Q29 44 43 27M44 9Q44 29 27 43" fill="none" stroke="url(#${id}l)" stroke-width="1.15" opacity=".78"/>`;
 if(k>=9)p+=`<path d="M8 57L8 23L23 8H57L45 13L26 13L13 26L13 45Z" fill="url(#${id}m)" opacity=".62"/>`;
 return p;
}

function collectorFrameSvg(classIndex){
 const i=Math.max(0,Math.min(9,Number(classIndex)||0));
 const [dark,mid,light,shade]=METALS[i],id="fameframe"+(uid++),holo=i===9;
 const colors=holo?["#c6dff2","#d9c4f3","#f5efdb","#aad6dd","#f1d2df","#dde7ff","#e1d5e5"]:[dark,mid,light,shade,mid,light,dark];
 const stops=colors.map((c,n)=>`<stop offset="${(n/(colors.length-1)*100).toFixed(1)}%" stop-color="${c}"/>`).join("");
 const cornerArt=corner(i,id);
 const corners=`<g>${cornerArt}</g><g transform="translate(300 0) scale(-1 1)">${cornerArt}</g><g transform="translate(0 430) scale(1 -1)">${cornerArt}</g><g transform="translate(300 430) scale(-1 -1)">${cornerArt}</g>`;
 const weight=[2.4,2.8,3.1,3.5,3.7,4,4.4,5,5.7,6.5][i];
 let detail="";
 // Every tier adds a visibly different metalworking process, not merely another color.
 if(i>=1)detail+=`<path d="M12 52V113M288 52V113M12 316V378M288 316V378" fill="none" stroke="url(#${id}l)" stroke-width=".9" stroke-opacity=".39"/>`;
 if(i>=2)detail+=`<rect x="11" y="11" width="278" height="408" rx="11" stroke="url(#${id}l)" stroke-width=".85" opacity=".55" fill="none"/><path d="M14 114V161M286 114V161M14 270V317M286 270V317" stroke="${mid}" stroke-width="1" opacity=".68"/>`;
 if(i>=3)detail+=`<path d="M11 131L17 139L11 147M289 131L283 139L289 147M11 284L17 292L11 300M289 284L283 292L289 300" stroke="url(#${id}m)" stroke-width="2" fill="none" opacity=".8"/><path d="M26 10H83M217 10H274M26 420H83M217 420H274" stroke="${light}" stroke-width=".9" opacity=".52"/>`;
 if(i>=4)detail+=`<path d="M90 10L103 15L116 10M210 10L197 15L184 10M90 420L103 415L116 420M210 420L197 415L184 420" stroke="url(#${id}l)" stroke-width="1.05" opacity=".75" fill="none"/><path d="M19 173l4 7-4 7-4-7zM281 173l4 7-4 7-4-7z" fill="${mid}" opacity=".8"/>`;
 if(i>=5)detail+=`<path d="M126 10L139 10L150 16L161 10H174M126 420H139L150 414L161 420H174" stroke="url(#${id}l)" stroke-width="1.45" fill="none"/><path d="M17 102Q24 118 17 133M283 102Q276 118 283 133M17 297Q24 312 17 327M283 297Q276 312 283 327" stroke="${mid}" stroke-width="1.05" fill="none" opacity=".83"/>`;
 if(i>=6)detail+=`<path d="M150 5L157 12L150 19L143 12Z M150 411L157 418L150 425L143 418Z" stroke="url(#${id}l)" stroke-width="1.35" fill="url(#${id}g)"/><path d="M4 200L13 210L4 220M296 200L287 210L296 220" stroke="url(#${id}m)" stroke-width="2" fill="none"/>`;
 if(i>=7)detail+=`<path d="M41 9Q63 17 85 12M259 9Q237 17 215 12M41 421Q63 413 85 418M259 421Q237 413 215 418" stroke="${light}" stroke-width="1.5" opacity=".78" fill="none"/><path d="M10 160L18 174L10 188M290 160L282 174L290 188" stroke="url(#${id}m)" stroke-width="2" fill="none"/>`;
 if(i>=8)detail+=`<path d="M107 9L120 13L133 8L150 2L167 8L180 13L193 9M107 421L120 417L133 422L150 428L167 422L180 417L193 421" stroke="url(#${id}l)" stroke-width="1.7" fill="none" opacity=".98"/>${gem(150,12,9,id)}${gem(150,418,9,id)}<path d="M43 15Q52 30 73 21M257 15Q248 30 227 21M43 415Q52 400 73 409M257 415Q248 400 227 409" stroke="${light}" stroke-width="1.05" fill="none" opacity=".7"/>`;
 if(i===9)detail+=`${gem(10,216,10,id)}${gem(290,216,10,id)}<path d="M8 66L8 29L29 8H67M292 66V29L271 8H233M8 364V401L29 422H67M292 364V401L271 422H233" stroke="url(#${id}m)" stroke-width="2.8" opacity=".68" fill="none"/>`;
 const glint=i>=6?`<path class="fameframe-glint" d="M27 7H270M293 32V396M270 423H27M7 396V32" stroke="#fff" stroke-width="${i===9?1.1:.7}" stroke-dasharray="${i===9?'7 72':'2 80'}" stroke-linecap="round" fill="none" opacity=".42"/>`:"";
 return `<svg class="famecard-collectors-frame fameframe-${i}" viewBox="0 0 300 430" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
 <defs>
 <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
 <linearGradient id="${id}l" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${shade}"/><stop offset=".24" stop-color="${mid}"/><stop offset=".5" stop-color="${light}"/><stop offset=".78" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
 <radialGradient id="${id}g" cx=".28" cy=".2" r=".9"><stop stop-color="#fff"/><stop offset=".32" stop-color="${light}"/><stop offset=".68" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
 </defs>
 <rect x="4" y="4" width="292" height="422" rx="16.5" fill="none" stroke="url(#${id}m)" stroke-width="${weight}" opacity="${i<=2?.82:.95}"/>
 <rect x="7.7" y="7.7" width="284.6" height="414.6" rx="13.7" fill="none" stroke="${light}" stroke-width="${i>=8?1.05:.75}" opacity="${i>=7?.7:.42}"/>
 <rect x="13.4" y="13.4" width="273.2" height="403.2" rx="10.5" fill="none" stroke="${dark}" stroke-width="${i>=6?1.3:.8}" opacity=".72"/>
 ${corners}${detail}${glint}
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
