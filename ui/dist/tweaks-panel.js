const __TWEAKS_STYLE=`
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;width:100%;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}
`;function useTweaks(o){const[e,r]=React.useState(o),a=React.useCallback((t,s)=>{const d=typeof t=="object"&&t!==null?t:{[t]:s};r(c=>({...c,...d})),window.parent.postMessage({type:"__edit_mode_set_keys",edits:d},"*")},[]);return[e,a]}function TweaksPanel({title:o="Tweaks",children:e}){const[r,a]=React.useState(!1),t=React.useRef(null),s=React.useRef({x:16,y:16}),d=16,c=React.useCallback(()=>{const n=t.current;if(!n)return;const l=n.offsetWidth,p=n.offsetHeight,i=Math.max(d,window.innerWidth-l-d),u=Math.max(d,window.innerHeight-p-d);s.current={x:Math.min(i,Math.max(d,s.current.x)),y:Math.min(u,Math.max(d,s.current.y))},n.style.right=s.current.x+"px",n.style.bottom=s.current.y+"px"},[]);React.useEffect(()=>{if(!r)return;if(c(),typeof ResizeObserver>"u")return window.addEventListener("resize",c),()=>window.removeEventListener("resize",c);const n=new ResizeObserver(c);return n.observe(document.documentElement),()=>n.disconnect()},[r,c]),React.useEffect(()=>{const n=l=>{const p=l?.data?.type;p==="__activate_edit_mode"?a(!0):p==="__deactivate_edit_mode"&&a(!1)};return window.addEventListener("message",n),window.parent.postMessage({type:"__edit_mode_available"},"*"),()=>window.removeEventListener("message",n)},[]);const g=()=>{a(!1),window.parent.postMessage({type:"__edit_mode_dismissed"},"*")},x=n=>{const l=t.current;if(!l)return;const p=l.getBoundingClientRect(),i=n.clientX,u=n.clientY,w=window.innerWidth-p.right,b=window.innerHeight-p.bottom,k=f=>{s.current={x:w-(f.clientX-i),y:b-(f.clientY-u)},c()},h=()=>{window.removeEventListener("mousemove",k),window.removeEventListener("mouseup",h)};window.addEventListener("mousemove",k),window.addEventListener("mouseup",h)};return r?React.createElement(React.Fragment,null,React.createElement("style",null,__TWEAKS_STYLE),React.createElement("div",{ref:t,className:"twk-panel",style:{right:s.current.x,bottom:s.current.y}},React.createElement("div",{className:"twk-hd",onMouseDown:x},React.createElement("b",null,o),React.createElement("button",{className:"twk-x","aria-label":"Close tweaks",onMouseDown:n=>n.stopPropagation(),onClick:g},"\u2715")),React.createElement("div",{className:"twk-body"},e))):null}function TweakSection({label:o,children:e}){return React.createElement(React.Fragment,null,React.createElement("div",{className:"twk-sect"},o),e)}function TweakRow({label:o,value:e,children:r,inline:a=!1}){return React.createElement("div",{className:a?"twk-row twk-row-h":"twk-row"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,o),e!=null&&React.createElement("span",{className:"twk-val"},e)),r)}function TweakSlider({label:o,value:e,min:r=0,max:a=100,step:t=1,unit:s="",onChange:d}){return React.createElement(TweakRow,{label:o,value:`${e}${s}`},React.createElement("input",{type:"range",className:"twk-slider",min:r,max:a,step:t,value:e,onChange:c=>d(Number(c.target.value))}))}function TweakToggle({label:o,value:e,onChange:r}){return React.createElement("div",{className:"twk-row twk-row-h"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,o)),React.createElement("button",{type:"button",className:"twk-toggle","data-on":e?"1":"0",role:"switch","aria-checked":!!e,onClick:()=>r(!e)},React.createElement("i",null)))}function TweakRadio({label:o,value:e,options:r,onChange:a}){const t=React.useRef(null),[s,d]=React.useState(!1),c=r.map(i=>typeof i=="object"?i:{value:i,label:i}),g=Math.max(0,c.findIndex(i=>i.value===e)),x=c.length,n=React.useRef(e);n.current=e;const l=i=>{const u=t.current.getBoundingClientRect(),w=u.width-4,b=Math.floor((i-u.left-2)/w*x);return c[Math.max(0,Math.min(x-1,b))].value};return React.createElement(TweakRow,{label:o},React.createElement("div",{ref:t,role:"radiogroup",onPointerDown:i=>{d(!0);const u=l(i.clientX);u!==n.current&&a(u);const w=k=>{if(!t.current)return;const h=l(k.clientX);h!==n.current&&a(h)},b=()=>{d(!1),window.removeEventListener("pointermove",w),window.removeEventListener("pointerup",b)};window.addEventListener("pointermove",w),window.addEventListener("pointerup",b)},className:s?"twk-seg dragging":"twk-seg"},React.createElement("div",{className:"twk-seg-thumb",style:{left:`calc(2px + ${g} * (100% - 4px) / ${x})`,width:`calc((100% - 4px) / ${x})`}}),c.map(i=>React.createElement("button",{key:i.value,type:"button",role:"radio","aria-checked":i.value===e},i.label))))}function TweakSelect({label:o,value:e,options:r,onChange:a}){return React.createElement(TweakRow,{label:o},React.createElement("select",{className:"twk-field",value:e,onChange:t=>a(t.target.value)},r.map(t=>{const s=typeof t=="object"?t.value:t,d=typeof t=="object"?t.label:t;return React.createElement("option",{key:s,value:s},d)})))}function TweakText({label:o,value:e,placeholder:r,onChange:a}){return React.createElement(TweakRow,{label:o},React.createElement("input",{className:"twk-field",type:"text",value:e,placeholder:r,onChange:t=>a(t.target.value)}))}function TweakNumber({label:o,value:e,min:r,max:a,step:t=1,unit:s="",onChange:d}){const c=n=>r!=null&&n<r?r:a!=null&&n>a?a:n,g=React.useRef({x:0,val:0});return React.createElement("div",{className:"twk-num"},React.createElement("span",{className:"twk-num-lbl",onPointerDown:n=>{n.preventDefault(),g.current={x:n.clientX,val:e};const l=(String(t).split(".")[1]||"").length,p=u=>{const w=u.clientX-g.current.x,b=g.current.val+w*t,k=Math.round(b/t)*t;d(c(Number(k.toFixed(l))))},i=()=>{window.removeEventListener("pointermove",p),window.removeEventListener("pointerup",i)};window.addEventListener("pointermove",p),window.addEventListener("pointerup",i)}},o),React.createElement("input",{type:"number",value:e,min:r,max:a,step:t,onChange:n=>d(c(Number(n.target.value)))}),s&&React.createElement("span",{className:"twk-num-unit"},s))}function TweakColor({label:o,value:e,onChange:r}){return React.createElement("div",{className:"twk-row twk-row-h"},React.createElement("div",{className:"twk-lbl"},React.createElement("span",null,o)),React.createElement("input",{type:"color",className:"twk-swatch",value:e,onChange:a=>r(a.target.value)}))}function TweakButton({label:o,onClick:e,secondary:r=!1}){return React.createElement("button",{type:"button",className:r?"twk-btn secondary":"twk-btn",onClick:e},o)}Object.assign(window,{useTweaks,TweaksPanel,TweakSection,TweakRow,TweakSlider,TweakToggle,TweakRadio,TweakSelect,TweakText,TweakNumber,TweakColor,TweakButton});
