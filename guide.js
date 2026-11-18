document.getElementById('copy-note').addEventListener('click',async()=>{const note=document.getElementById('request-note'),status=document.getElementById('copy-status');try{await navigator.clipboard.writeText(note.value);status.textContent='已複製，可以貼到文件列印囉！';}catch{note.focus();note.select();status.textContent='請長按或按 Ctrl+C 複製選取的內容。';}});
(() => {
 const columns=document.querySelector('.guide-columns'),sidebar=document.querySelector('.guide-sidebar');
 const steps=columns?.querySelector(':scope > .panel'),checklist=sidebar?.querySelector('.checklist');
 if(!steps||!checklist)return;
 function fitNote(){
  if(!matchMedia('(min-width:761px)').matches){sidebar.style.removeProperty('--note-room');return;}
  const gap=parseFloat(getComputedStyle(checklist).marginBottom)||0;
  const room=Math.max(0,steps.getBoundingClientRect().bottom-checklist.getBoundingClientRect().bottom-gap);
  sidebar.style.setProperty('--note-room',room+'px');
 }
 if(window.ResizeObserver){const observer=new ResizeObserver(fitNote);observer.observe(steps);observer.observe(checklist);}
 window.addEventListener('resize',fitNote);
 document.querySelector('.optional-note').addEventListener('toggle',fitNote);
 document.fonts?.ready.then(fitNote);
 fitNote();
})();
