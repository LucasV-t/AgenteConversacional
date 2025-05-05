const Fastify = require('fastify');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cookie = require('@fastify/cookie');
const axios = require('axios'); // Adicionando axios para a chamada ao modelo

// Inicialize o Fastify
const fastify = Fastify({ logger: true });

// Registre o plugin de cookies
fastify.register(cookie);

// Função para carregar o chatlog do arquivo JSON
function loadChatlog(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return {}; // Arquivo existe mas está vazio

    return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao carregar chatlog:', e.message);
    return {};
  }
}

// Rota para criar ou carregar uma sessão (ID do usuário)
fastify.get('/session', async (request, reply) => {
  const chatlogPath = path.join(__dirname, 'chatlog.json');
  const chatlog = loadChatlog(chatlogPath);

  // Obtenha o userId do cookie
  let userId = request.cookies.userId;

  // Se o userId não existir ou não estiver registrado, cria um novo
  if (!userId || !chatlog[userId]) {
    userId = uuidv4(); // Gera um ID único
    chatlog[userId] = []; // Cria uma entrada para o novo ID no chatlog
    fs.writeFileSync(chatlogPath, JSON.stringify(chatlog, null, 2)); // Salva no arquivo
  }

  // Define o cookie com o ID do usuário
  reply.setCookie('userId', userId, {
    path: '/',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30 // Expira em 30 dias
  });

  return reply.send({ message: 'Sessão ativa', userId });
});

// Rota para enviar o prompt para o modelo DeepSeek
fastify.post('/deepseek', async (request, reply) => {
  const { prompt } = request.body;
  const userId = request.cookies.userId;
  const chatlogPath = path.join(__dirname, 'chatlog.json');

  if (!userId) {
    return reply.status(400).send({ error: 'ID do usuário não registrado.' });
  }

  if (!prompt) {
    return reply.status(400).send({ error: 'Prompt é obrigatório.' });
  }

  const chatlog = loadChatlog(chatlogPath);
  if (!chatlog[userId]) {
    return reply.status(401).send({ error: 'ID não encontrado. Registre-se primeiro.' });
  }

  try {
    // Aqui fazemos a chamada para o modelo DeepSeek
    const modelUrl = 'http://localhost:11434/api/generate';

    const modelResponse = await axios.post(modelUrl, {
      model: 'deepseek-r1:1.5b', // Nome do modelo
      prompt: prompt,
      stream: false
    })
      .then(response => response.data.response) // Ajuste conforme o formato da resposta da API
      .catch(error => {
        console.error('Erro ao chamar o modelo:', error);
        return 'Erro ao gerar a resposta do modelo.';
      });

    // Armazena a resposta no histórico do usuário
    chatlog[userId].push({ user: prompt, assistant: modelResponse });
    fs.writeFileSync(chatlogPath, JSON.stringify(chatlog, null, 2));

    return reply.send({ response: modelResponse });
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Erro ao consultar o modelo DeepSeek.' });
  }
});

// Serve arquivos estáticos do diretório 'public'
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/', // O caminho para acessar os arquivos estáticos será '/index.html'
});

// Rota GET para retornar a página inicial
fastify.get('/', async (request, reply) => {
  reply.type('text/html').sendFile('index.html');
});

// Inicia o servidor
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando em http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
