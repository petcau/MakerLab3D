export const NIVEL_NOMES = [
  'Explorador Iniciante', 'Curioso Digital',    'Aprendiz Maker',
  'Construtor Criativo',  'Inventor em Ação',   'Programador Maker',
  'Engenheiro Criativo',  'Inovador Maker',     'Mentor Maker',
  'Mestre Maker',
];

export const NIVEL_PONTOS = [0, 100, 250, 500, 900, 1400, 2000, 2700, 3500, 4500];

export function getNivelIdx(pts, pontosCustom = NIVEL_PONTOS) {
  for (let i = pontosCustom.length - 1; i >= 0; i--) {
    if (pts >= pontosCustom[i]) return i;
  }
  return 0;
}

export function getSemanaLetiva() {
  const hoje  = new Date();
  const inicio = new Date(hoje.getFullYear(), 2, 1);
  return Math.max(1, Math.ceil((hoje - inicio) / (7 * 24 * 3600 * 1000)));
}
