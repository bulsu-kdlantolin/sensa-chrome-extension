// This script gets injected into the page context to intercept game audio
export const audioInterceptorScript = `
(function() {
  const interceptedContexts = new Set();
  const OriginalAudioContext = window.AudioContext;
  const OriginalWebkitAudioContext = window.webkitAudioContext;
  
  function createInterceptedContext(OriginalClass) {
    if (!OriginalClass) return OriginalClass;
    
    return class extends OriginalClass {
      constructor() {
        super();
        const ctx = this;
        
        if (!interceptedContexts.has(ctx)) {
          interceptedContexts.add(ctx);
          
          try {
            // Create analyser to tap into audio
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.02;
            
            // Intercept destination to inject analyser
            const origDestination = ctx.destination;
            const splitter = ctx.createGain();
            splitter.connect(origDestination);
            splitter.connect(analyser);
            
            // Replace destination
            let destinationOverridden = false;
            Object.defineProperty(ctx, 'destination', {
              get: function() {
                if (!destinationOverridden) return splitter;
                return origDestination;
              },
              set: function(val) {
                destinationOverridden = true;
              },
              configurable: true
            });
            
            // Send frequency data
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let animId = 0;
            const sendFrequencies = () => {
              analyser.getByteFrequencyData(dataArray);
              window.postMessage({
                type: 'SENSA_GAME_AUDIO_FREQUENCY',
                frequencies: Array.from(dataArray)
              }, '*');
              animId = requestAnimationFrame(sendFrequencies);
            };
            sendFrequencies();
            
            window.postMessage({
              type: 'SENSA_WEB_AUDIO_ACTIVE'
            }, '*');
          } catch(e) {
            console.warn('Sensa audio interceptor error:', e);
          }
        }
      }
    };
  }
  
  try {
    if (OriginalAudioContext) {
      window.AudioContext = createInterceptedContext(OriginalAudioContext);
    }
  } catch(e) {}
  
  try {
    if (OriginalWebkitAudioContext) {
      window.webkitAudioContext = createInterceptedContext(OriginalWebkitAudioContext);
    }
  } catch(e) {}
})();
`;
