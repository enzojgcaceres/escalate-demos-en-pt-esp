import Script from 'next/script';
import { INTERCOM_API_BASE, INTERCOM_APP_ID, INTERCOM_CONFIGURED } from '@/lib/intercom';

// Snippet oficial de instalación del Messenger, sin cambios salvo el app_id y el api_base parametrizados.
// Si no hay app_id válido no se carga nada (la página muestra el aviso).
export default function IntercomScript() {
  if (!INTERCOM_CONFIGURED) return null;
  return (
    <>
      <Script id="intercom-settings" strategy="afterInteractive">
        {`window.intercomSettings = { api_base: "${INTERCOM_API_BASE}", app_id: "${INTERCOM_APP_ID}" };`}
      </Script>
      <Script id="intercom-loader" strategy="afterInteractive">
        {`(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/${INTERCOM_APP_ID}';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();`}
      </Script>
    </>
  );
}
