/* Explicit school registration. Existing proof is reused across all assignments. */
(function (root,factory) {
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.HtmlConfirmationCoordinator=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LOCK='joho.htmleditor.identity-confirmation.v3';
  function create(options) {
    if(!options || !options.locks || typeof options.locks.request!=='function') throw Error('cross_tab_lock_unavailable');
    let pending=null;
    return {
      ensure(request={}) {
        if(request.userInitiated!==true) return Promise.reject(Error('user_confirmation_required'));
        if(pending) return pending;
        const operation=options.locks.request(LOCK,{mode:'exclusive'},async()=>{
          const state=await options.cache.load();
          if(state.status==='ready' && request.switchAccount!==true) return state;
          const ticket=await options.cache.beginConfirmation(request);
          // Deterministic bounded spacing distributes simultaneous first registrations.
          // No sleeping/retry when a usable proof already exists.
          try {
            const random=options.randomFraction();
            if(!Number.isFinite(random) || random<0 || random>=1) throw Error('jitter_invalid');
            await options.delay(Math.floor(random*3000));
            const response=await options.confirmViaExistingBridge(ticket);
            return await options.cache.acceptConfirmation(ticket,response);
          } catch(e) {options.cache.cancelConfirmation();throw e;}
        });
        const result=operation.finally(()=>{if(pending===result)pending=null;});pending=result;return result;
      }
    };
  }
  return {create,LOCK};
}));
