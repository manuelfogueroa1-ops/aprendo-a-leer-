// Vocabulario compartido por los minijuegos (letras, sílabas y palabras con imagen).
(() => {
  const PALABRAS = [
    { palabra: 'casa', imagen: '🏠', silabas: ['ca', 'sa'] },
    { palabra: 'gato', imagen: '🐱', silabas: ['ga', 'to'] },
    { palabra: 'luna', imagen: '🌙', silabas: ['lu', 'na'] },
    { palabra: 'sapo', imagen: '🐸', silabas: ['sa', 'po'] },
    { palabra: 'pato', imagen: '🦆', silabas: ['pa', 'to'] },
    { palabra: 'mono', imagen: '🐒', silabas: ['mo', 'no'] },
    { palabra: 'dedo', imagen: '👆', silabas: ['de', 'do'] },
    { palabra: 'dado', imagen: '🎲', silabas: ['da', 'do'] },
    { palabra: 'mano', imagen: '✋', silabas: ['ma', 'no'] },
    { palabra: 'mapa', imagen: '🗺️', silabas: ['ma', 'pa'] },
    { palabra: 'lupa', imagen: '🔎', silabas: ['lu', 'pa'] },
    { palabra: 'pelota', imagen: '⚽', silabas: ['pe', 'lo', 'ta'] },
    { palabra: 'tomate', imagen: '🍅', silabas: ['to', 'ma', 'te'] },
    { palabra: 'conejo', imagen: '🐰', silabas: ['co', 'ne', 'jo'] },
    { palabra: 'helado', imagen: '🍦', silabas: ['he', 'la', 'do'] },
    { palabra: 'regalo', imagen: '🎁', silabas: ['re', 'ga', 'lo'] }
  ];
  const CONSONANTES = ['p', 'm', 'l', 's', 't', 'n', 'd', 'b', 'f', 'r'];
  const VOCALES = ['a', 'e', 'i', 'o', 'u'];
  const SILABAS = CONSONANTES.flatMap(c => VOCALES.map(v => c + v));
  const ALFABETO = 'abcdefghijklmnñopqrstuvwxyz'.split('');

  const mezclar = lista => {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  };
  const elegir = lista => lista[Math.floor(Math.random() * lista.length)];

  window.Banco = { PALABRAS, CONSONANTES, VOCALES, SILABAS, ALFABETO, mezclar, elegir };
})();