export function startRecovery({send,online=()=>navigator.onLine,now=()=>Date.now(),setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
 const form=document.getElementById('resetForm'),email=document.getElementById('resetEmail'),button=document.getElementById('resetSend'),status=document.getElementById('resetStatus');
 let busy=false,nextTry=0,timer;
 const message=(text,state='')=>{status.textContent=text;status.dataset.state=state;};
 function update(){const remaining=Math.max(0,Math.ceil((nextTry-now())/1000));button.disabled=busy||remaining>0;button.textContent=busy?'A enviar…':remaining?'Podes reenviar em '+remaining+' s':'Enviar email de recuperação';if(!remaining&&timer){clearIntervalFn(timer);timer=null;}}
 function cooldown(){nextTry=now()+60000;if(timer)clearIntervalFn(timer);timer=setIntervalFn(update,1000);update();}
 function sent(){message('Se este email estiver associado a uma conta, receberás uma mensagem com a ligação para redefinir a palavra-passe.\n\nVerifica a caixa de entrada e a pasta de spam. Depois de escolheres a nova palavra-passe, volta à aplicação para entrar.','success');cooldown();}
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||now()<nextTry)return;
  const value=email.value.trim();email.value=value;
  if(!value||!email.checkValidity()){message('Indica um endereço de email válido.','error');email.reportValidity();return;}
  if(!online()){message('Liga-te à internet para pedir o email de recuperação. Depois, tenta novamente.','error');return;}
  busy=true;update();message('A pedir o email de recuperação…');
  try{await send(value);sent();}
  catch(error){if(error?.code==='auth/user-not-found')sent();else if(error?.code==='auth/too-many-requests'){message('Foram feitos demasiados pedidos. Aguarda um pouco antes de tentar novamente.','error');cooldown();}
   else if(error?.code==='auth/invalid-email')message('Indica um endereço de email válido.','error');
   else if(error?.code==='auth/network-request-failed')message('Não foi possível enviar o pedido. Confirma a ligação à internet e tenta novamente.','error');
   else message('Não foi possível concluir o pedido. Tenta novamente mais tarde ou contacta o Game Control.','error');}
  finally{busy=false;update();}
 };
 message('');update();
 return {dispose(){if(timer)clearIntervalFn(timer);form.onsubmit=null;}};
}
