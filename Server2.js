const Fastify = require("fastify");
const path = require("path");
const axios = require("axios");
const fastifyCookie = require("@fastify/cookie");
const { Pool } = require("pg");

const fastify = Fastify({ logger: true });

// Conexão com Postgres
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "123",
  port: 5432,
});

// Cookies
fastify.register(fastifyCookie);

// Arquivos estáticos (front-end)
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// Rota inicial
fastify.get("/", async (req, reply) => {
  return reply.type("text/html").sendFile("index.html");
});


// ======================
// ROTAS DE AUTENTICAÇÃO
// ======================

// Registrar usuário
fastify.post("/register", async (req, reply) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return reply.status(400).send({ error: "Usuário e senha são obrigatórios" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      [username, password]
    );
    return reply.send({ message: "Usuário registrado com sucesso!", id: result.rows[0].id });
  } catch (err) {
    if (err.code === "23505") {
      return reply.status(400).send({ error: "Usuário já existe" });
    }
    console.error(err);
    return reply.status(500).send({ error: "Erro ao registrar usuário" });
  }
});

// Login
fastify.post("/login", async (req, reply) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return reply.status(400).send({ error: "Usuário não encontrado" });
    }

    const user = result.rows[0];
    if (user.password !== password) {
      return reply.status(400).send({ error: "Senha incorreta" });
    }

    reply.setCookie("user", username, { path: "/" });
    return reply.send({ message: "Login realizado com sucesso", user: username, userId: user.id });
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: "Erro ao realizar login" });
  }
});

// Logout
fastify.post("/logout", async (req, reply) => {
  reply.clearCookie("user", { path: "/" });
  return reply.send({ message: "Logout realizado com sucesso" });
});


// ======================
// ROTA DE CHAT COM IA
// ======================

fastify.post("/deepseek", async (req, reply) => {
  const username = req.cookies.user;
  if (!username) {
    return reply.status(401).send({ error: "Não autenticado. Faça login primeiro." });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return reply.status(400).send({ error: "Prompt é obrigatório." });
  }

  try {
    // Buscar ID do usuário logado
    const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ error: "Usuário não encontrado." });
    }
    const userId = userResult.rows[0].id;

    // Chamar o modelo via Ollama
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "deepseek-r1:1.5b",
      prompt: prompt,
      stream: false,
    });

    let modelResponse = response.data.response;

    // Remover raciocínio interno <think>...</think>
    modelResponse = modelResponse.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Salvar histórico no banco
    await pool.query("INSERT INTO chatlog (user_id, role, content) VALUES ($1, $2, $3)", [userId, "user", prompt]);
    await pool.query("INSERT INTO chatlog (user_id, role, content) VALUES ($1, $2, $3)", [userId, "assistant", modelResponse]);

    return reply.send({ response: modelResponse });
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: "Erro ao consultar o modelo DeepSeek." });
  }
});

// ======================
// ROTA: Histórico de mensagens
// ======================
fastify.get("/history", async (req, reply) => {
  const username = req.cookies.user;
  if (!username) {
    return reply.status(401).send({ error: "Não autenticado. Faça login primeiro." });
  }

  try {
    // Buscar ID do usuário
    const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ error: "Usuário não encontrado." });
    }
    const userId = userResult.rows[0].id;

    // Buscar mensagens
    const history = await pool.query(
      "SELECT role, content, created_at FROM chatlog WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );

    return reply.send({ user: username, history: history.rows });
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: "Erro ao recuperar histórico." });
  }
});


// ======================
// INICIAR SERVIDOR
// ======================
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Servidor rodando em http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();


