(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);},shell=$('file-menu-button').parentElement,menu=$('file-menu'),tabMenu=$('tab-menu'),targetId=null,tabAnchor=null,lastTrigger=null,actionRestore=null;
  function closeCategories(){document.querySelectorAll('.menu-category > button').forEach(function(button){button.setAttribute('aria-expanded','false');var panel=$(button.getAttribute('aria-controls'));if(panel)panel.hidden=true;});}
  function closeAll(){closeCategories();shell.classList.remove('menu-open');$('file-menu-button').setAttribute('aria-expanded','false');tabMenu.hidden=true;tabMenu.style.left='';tabMenu.style.top='';if(tabAnchor)tabAnchor.setAttribute('aria-expanded','false');tabAnchor=null;targetId=null;lastTrigger=null;}
  function openCategory(button,focusFirst){closeCategories();var panel=$(button.getAttribute('aria-controls'));if(!panel)return;panel.hidden=false;button.setAttribute('aria-expanded','true');lastTrigger=button;if(focusFirst){var item=panel.querySelector('[role="menuitem"]');if(item)item.focus();}}
  $('file-menu-button').addEventListener('click',function(){var open=shell.classList.contains('menu-open');closeAll();if(!open){shell.classList.add('menu-open');this.setAttribute('aria-expanded','true');lastTrigger=this;}});
  document.querySelectorAll('.menu-category > button').forEach(function(button){
    button.addEventListener('click',function(){var panel=$(this.getAttribute('aria-controls')),open=panel&&!panel.hidden;closeCategories();if(open){lastTrigger=null;return;}openCategory(this,false);});
    button.addEventListener('pointerenter',function(event){if(event.pointerType==='mouse'&&window.matchMedia('(hover: hover)').matches)openCategory(this,false);});
  });
  document.addEventListener('click',function(event){var item=event.target.closest('.menu-category .popup-menu [role="menuitem"],#tab-menu [role="menuitem"]');if(!item)return;var category=item.closest('.menu-category'),openedForFile=shell.classList.contains('menu-open');actionRestore=item.closest('#tab-menu')?tabAnchor:openedForFile?$('file-menu-button'):category&&category.querySelector(':scope > button');},true);
  document.addEventListener('click',function(event){
    var item=event.target.closest('.menu-category .popup-menu [role="menuitem"],#tab-menu [role="menuitem"]');
    if(item){closeAll();var dialog=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('dialog[open]'),opensNativeWindow=['load','registered-pdf','print','proof-print'].includes(item.id);if(!opensNativeWindow&&!dialog&&actionRestore&&actionRestore.isConnected)actionRestore.focus();actionRestore=null;return;}
    if(!event.target.closest('.menu-shell,.tab-menu,.tab-more'))closeAll();
  });
  document.addEventListener('pointerdown',function(event){if(!event.target.closest('.menu-shell,.tab-menu'))closeAll();},true);
  document.addEventListener('keydown',function(event){
    if(event.isComposing)return;
    var trigger=event.target.closest('.menu-category > button,#file-menu-button'),inTab=!!event.target.closest('#tab-menu'),inPopup=!!event.target.closest('.menu-category .popup-menu,#tab-menu');
    if(event.key==='Escape'&&(trigger||inPopup||shell.classList.contains('menu-open')||inTab)){
      event.preventDefault();var restore=inTab?tabAnchor:trigger||lastTrigger||$('file-menu-button');closeAll();if(restore&&restore.isConnected)restore.focus();return;
    }
    if(trigger&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
      event.preventDefault();var panel=$(trigger.getAttribute('aria-controls'));
      if(trigger.id==='file-menu-button'){
        if(!shell.classList.contains('menu-open'))$('file-menu-button').click();
        var first=menu.querySelector('.menu-category > button');if(first)first.focus();
      }else if(panel&&panel.hidden)openCategory(trigger,true);
      else if(panel){var firstItem=panel.querySelector('[role="menuitem"]');if(firstItem)firstItem.focus();}
      return;
    }
    if(inPopup&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      var popup=event.target.closest('.menu-category .popup-menu,#tab-menu'),items=Array.from(popup.querySelectorAll('[role="menuitem"]')).filter(function(item){return !item.disabled&&!item.closest('[hidden]');});
      if(!items.length)return;var index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index-1+items.length)%items.length;event.preventDefault();items[next].focus();
    }
  });
  document.addEventListener('focusin',function(event){if(!event.target.closest('.menu-shell,.tab-menu')){if(shell.classList.contains('menu-open')||tabAnchor)closeAll();}});
  function openTabMenu(localId,anchor){
    closeAll();if(!localId||!anchor)return;targetId=localId;tabAnchor=anchor;lastTrigger=anchor;anchor.setAttribute('aria-expanded','true');
    tabMenu.hidden=false;var rect=anchor.getBoundingClientRect(),width=190,height=tabMenu.offsetHeight||92,left=Math.max(6,Math.min(rect.right-width,window.innerWidth-width-6)),top=Math.max(6,Math.min(rect.bottom+4,window.innerHeight-height-6));
    tabMenu.style.left=left+'px';tabMenu.style.top=top+'px';tabMenu.hidden=false;var item=tabMenu.querySelector('[role="menuitem"]');if(item)item.focus();
  }
  window.OMRMenus={closeAll:closeAll,targetLocalId:function(){return targetId;},openTabMenu:openTabMenu};
})();
