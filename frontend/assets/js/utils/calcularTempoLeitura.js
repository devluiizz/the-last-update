export function calcularTempoLeitura(texto) {
  const palavrasPorMinuto = 200;
  const conteudo = typeof texto === "string" ? texto.trim() : "";

  if (!conteudo) {
    return 1;
  }

  const palavras = conteudo.split(/\s+/).filter(Boolean);
  const minutos = palavras.length / palavrasPorMinuto;

  return Math.max(1, Math.ceil(minutos));
}
