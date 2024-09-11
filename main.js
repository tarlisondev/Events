const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const port = process.env.MY_PORT || 3000
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configurar EJS como view engine
app.set('view engine', 'ejs');

// Configurar o middleware para processar dados do formulário
app.use(express.urlencoded({ extended: true }));

// Armazenar dados do usuário
let userData = {
    events: []
};

let tiktokLiveConnection = null;

app.get('/', (req, res) => {
    res.render('user', { tiktokUsername: '' });
});

app.post('/connect', (req, res) => {
    const tiktokUsername = req.body.username;
    
    if (tiktokLiveConnection) {
        tiktokLiveConnection.disconnect();
    }

    tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);

    // Adicione os listeners aqui, após criar a conexão
    tiktokLiveConnection.on('chat', data => {
        if (!data || !data.uniqueId || !data.comment) {
            console.error('Dados de chat inválidos recebidos');
            return;
        }

        console.log(`${data.uniqueId} comentou: ${data.comment}`);
        const event = { 
            type: 'comment', 
            user: data.uniqueId, 
            content: data.comment,
            timestamp: new Date().toISOString(),
            profilePicture: data.profilePictureUrl // Adicionando a URL da foto de perfil
        };

        userData.events.push(event);
        if (userData.events.length > MAX_EVENTS) {
            userData.events.shift(); // Remove o evento mais antigo
        }

        io.emit('newEvent', event);
    });

    tiktokLiveConnection.on('gift', data => {
        console.log(`${data.uniqueId} enviou um presente: ${data.giftName}`);
        const event = { 
            type: 'gift', 
            user: data.uniqueId, 
            content: data.giftName,
            profilePicture: data.profilePictureUrl // Adicionando a URL da foto de perfil
        };
        userData.events.push(event);
        io.emit('newEvent', event);
        
        // Emitir o evento com a URL da foto do remetente
        io.emit('gift-sent', {
            senderPhotoUrl: data.profilePictureUrl
        });
    });

    tiktokLiveConnection.on('like', data => {
        console.log(`${data.uniqueId} curtiu a live`);
        const event = { 
            type: 'like', 
            user: data.uniqueId, 
            content: 'Curtiu a live',
            profilePicture: data.profilePictureUrl // Adicionando a URL da foto de perfil
        };
        userData.events.push(event);
        io.emit('newEvent', event);
    });

    tiktokLiveConnection.on('streamEnd', () => {
        console.log('A live terminou');
        io.emit('streamEnd');
        clearEvents();
    });

    tiktokLiveConnection.connect().then(state => {
        console.log(`Conectado à live de ${state.roomInfo.owner.display_name}`);
        userData.events = [];
        io.emit('clearEvents');
        io.emit('connectionStatus', { connected: true, username: tiktokUsername });
    }).catch(err => {
        console.error('Falha ao conectar', err);
        io.emit('connectionStatus', { connected: false, error: 'Falha ao conectar à live' });
    });

    res.redirect('/');
});

const MAX_EVENTS = 100; // Limite máximo de eventos armazenados

function clearEvents() {
    userData.events = [];
    io.emit('clearEvents');
}

// Você também pode adicionar um comando para limpar eventos manualmente
app.post('/clear-events', (req, res) => {
    clearEvents();
    res.sendStatus(200);
});

server.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});