const db = require("../db/sqlite");

function estimateReadingMinutes(text) {
  if (!text) return 1;
  const plain = String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return 1;
  const words = plain.split(/\s+/).filter(Boolean);
  const minutes = words.length / 200;
  return Math.max(1, Math.ceil(minutes));
}

/**
 * Busca publicações pelo título ou categoria para autocomplete e página de resultados.
 * Aceita os seguintes parâmetros de consulta:
 *   - q: termo de busca (obrigatório para retornar resultados)
 *   - limit: número máximo de resultados (opcional). Se ausente ou inválido,
 *            todos os resultados correspondentes são retornados.
 *
 * A consulta considera apenas publicações com status 'published'. Os resultados
 * são ordenados pela data (mais recentes primeiro). Cada item retornado
 * inclui informações essenciais para exibição (id, slug, título, categoria,
 * data, imagem, autor) e um campo readingMinutes calculado dinamicamente.
 * Também retornamos o conteúdo completo para que a página de busca
 * possa construir o trecho (excerpt) e recalcular o tempo de leitura
 * caso precise ser atualizado em tempo real.
 */
function searchPublications(req, res) {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) {
    // Para evitar retornar todo o banco quando o termo está vazio ou muito curto,
    // retornamos lista vazia
    return res.json([]);
  }
  // Trata parâmetro de limite
  let limit = null;
  if (req.query.limit != null) {
    const parsed = Number(req.query.limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = parsed;
    }
  }
  // Monta SQL parametrizado usando LIKE com wildcard em ambas as extremidades
  const pattern = `%${q}%`;
  let sql = `SELECT p.id, p.slug, p.title, p.category, p.date, p.image, p.image_credit, p.content, m.nome AS author_name, m.id AS author_id, m.avatar_light AS author_avatar_light, m.avatar_dark AS author_avatar_dark
    FROM publications p
    JOIN members m ON p.author_id = m.id
    WHERE p.status = 'published' AND (p.title LIKE ? OR p.category LIKE ?)
    ORDER BY datetime(p.date) DESC`;
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }
  try {
    const rows = db.prepare(sql).all(pattern, pattern);
    const results = rows.map((row) => {
      const readingMinutes = estimateReadingMinutes(row.content);
      return {
        id: row.id,
        slug: row.slug || null,
        title: row.title || "",
        category: row.category || "",
        date: row.date || "",
        image: row.image || null,
        image_credit: row.image_credit || "",
        // Include full content for building excerpts and recalculating reading time when needed
        content: row.content || "",
        author: {
          id: row.author_id,
          name: row.author_name || "",
          avatar_light: row.author_avatar_light || "",
          avatar_dark: row.author_avatar_dark || "",
        },
        readingMinutes,
      };
    });
    return res.json(results);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Erro ao buscar publicações" });
  }
}

module.exports = { searchPublications };
