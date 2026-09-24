const status=document.querySelector('#status'),detail=document.querySelector('#detail'),retry=document.querySelector('#retry');
let target;
try{
  target=new URL(window.ENCORE_SERVER);
  if(!['https:','http:'].includes(target.protocol)||target.username||target.password)throw Error();
  target=new URL('/',target);
  target.search=location.search;target.hash=location.hash;
}catch{
  status.textContent='La scène n’est pas encore configurée.';
  detail.textContent='L’adresse du serveur doit être renseignée dans la configuration du site.';
  document.body.classList.add('stopped');
}
let running=false;
async function wake(){
  if(running||!target)return;
  running=true;retry.hidden=true;document.body.classList.remove('stopped');
  status.textContent='On réveille la scène…';
  detail.textContent='Le premier démarrage peut prendre environ une minute. Tu entreras automatiquement dès que tout sera prêt.';
  const started=Date.now();
  while(Date.now()-started<120000){
    if(navigator.onLine){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch(new URL('/api/health',target),{signal:controller.signal,cache:'no-store',credentials:'omit'});
        if(response.ok){
          const data=await response.json();
          if(data.app==='encore'&&data.ready===true){
            status.textContent='La scène est prête. À toi de jouer !';
            detail.textContent='Ouverture du jeu…';
            location.replace(target.href);return;
          }
        }
      }catch{/* A sleeping service may return HTML, a network error or a timeout. */}
      finally{clearTimeout(timeout);}
    }
    status.textContent=navigator.onLine?(Date.now()-started>30000?'Encore un instant, on branche les derniers câbles…':'On réveille la scène…'):'Tu sembles hors ligne…';
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  running=false;document.body.classList.add('stopped');retry.hidden=false;
  status.textContent=navigator.onLine?'Les platines prennent leur temps.':'La connexion a été interrompue.';
  detail.textContent='Vérifie ta connexion, puis réessaie. Ton lien de salon est conservé.';
}
retry.addEventListener('click',wake);
if(target)wake();
