/**
 * Bot de Soporte WhatsApp para AlasExpress
 *
 * Características:
 * - Busca soluciones en documentos de ayuda (GRATIS)
 * - Usa IA solo cuando es necesario (económico)
 * - Deriva a formulario cuando no puede resolver
 */

import * as path from 'path';
import express from 'express';
import * as http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as qrcode from 'qrcode';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { db } from './config/firebase';
import {
    initializeAI,
    handleSupportMessage,
    getWelcomeMessage,
    reloadDocuments,
    submitTicketToFormspree
} from './services/supportService';
import { Request, Response } from 'express';

// Cargar variables de entorno
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TIMEZONE = process.env.TIMEZONE || 'America/Argentina/Buenos_Aires';
const PORT = parseInt(process.env.PORT || '3000', 10);
const SUPPORT_FORM_URL = process.env.SUPPORT_FORM_URL || 'https://alasexpressweb.com/soporte';

// Contraseña para acceder al panel de vinculación (cambiar en Railway)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alasexpress2025';

console.log(`
╔════════════════════════════════════════════════════════════╗
║         🚀 Bot Soporte - AlasExpress                       ║
║                                                            ║
║  Puerto: ${PORT.toString().padEnd(47)}║
║  Formulario: ${SUPPORT_FORM_URL.substring(0, 43).padEnd(43)}║
╚════════════════════════════════════════════════════════════╝
`);

// Inicializar IA
initializeAI();

// ==================== SERVIDOR EXPRESS + SOCKET.IO ====================

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const publicPath = path.join(__dirname, '..', 'public');
app.use(express.json());

// Middleware de autenticación para proteger el panel
const authMiddleware = (req: Request, res: Response, next: Function) => {
    // Permitir assets estáticos sin auth
    if (req.path.includes('.js') || req.path.includes('.css') || req.path.includes('socket.io')) {
        return next();
    }

    // Verificar si ya está autenticado (cookie)
    const authCookie = req.headers.cookie?.includes('alasexpress_auth=true');
    if (authCookie) {
        return next();
    }

    // Verificar contraseña en query param
    const password = req.query.password;
    if (password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', 'alasexpress_auth=true; Path=/; Max-Age=86400');
        return next();
    }

    // Mostrar página de login
    if (req.path === '/' && !password) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>🔒 Acceso Restringido - AlasExpress</title>
                <style>
                    body { font-family: Arial; background: #1a1a2e; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .container { text-align: center; padding: 2rem; }
                    h1 { color: #64ffda; }
                    input { padding: 12px 20px; font-size: 16px; border: none; border-radius: 8px; margin: 10px; }
                    button { padding: 12px 30px; font-size: 16px; background: #64ffda; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
                    button:hover { background: #4cd9c4; }
                    .error { color: #ff6b6b; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔒 Bot Soporte AlasExpress</h1>
                    <p>Este panel es exclusivo para administradores.</p>
                    <form method="GET">
                        <input type="password" name="password" placeholder="Contraseña" required>
                        <br>
                        <button type="submit">Acceder</button>
                    </form>
                    ${req.query.password ? '<p class="error">❌ Contraseña incorrecta</p>' : ''}
                </div>
            </body>
            </html>
        `);
        return;
    }

    res.redirect('/');
};

app.use(authMiddleware);
app.use(express.static(publicPath));

// Página principal - QR
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// API: Estado del bot
app.get('/api/status', (req: Request, res: Response) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// API: Recargar documentos de ayuda
app.post('/api/reload-docs', (req: Request, res: Response) => {
    reloadDocuments();
    res.json({ success: true, message: 'Documentos recargados' });
});

// ==================== CLIENTE WHATSAPP ====================

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'alasexpress-support',
        dataPath: './whatsapp-sessions'
    }),
    puppeteer: {
        headless: true,
        executablePath: executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--single-process'
        ]
    }
});

// Cache simple para usuarios
const userCache = new Map<string, { name: string | null; lastMessage: Date }>();

// Evento: QR Code
client.on('qr', async (qr) => {
    console.log('\n❗ ESCANEA EL CÓDIGO QR');

    try {
        const qrImageUrl = await qrcode.toDataURL(qr);
        io.emit('qr', qrImageUrl);
        console.log('📱 QR enviado a la web');
    } catch (err) {
        console.error('❌ Error generando QR:', err);
    }
});

// Evento: Autenticación exitosa
client.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado');
    io.emit('status', { estado: 'autenticado' });
});

// Evento: Cliente listo
client.on('ready', async () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ Bot de Soporte conectado y listo!                      ║
║                                                            ║
║  Escuchando mensajes...                                    ║
╚════════════════════════════════════════════════════════════╝
`);

    io.emit('status', { estado: 'conectado' });
    io.emit('ready', { mensaje: 'Bot conectado' });
});

// Evento: Mensaje recibido
client.on('message', async (msg) => {
    // Ignorar mensajes propios y de grupos
    if (msg.fromMe || msg.from.includes('@g.us')) return;
    if (!msg.body || msg.body.trim() === '') return;

    const clientPhone = msg.from.replace('@c.us', '');
    const userMessage = msg.body.trim();

    console.log(`\n📩 ${clientPhone}: "${userMessage}"`);

    try {
        // Obtener info del usuario del cache o WhatsApp
        let userName: string | null = null;
        const cached = userCache.get(clientPhone);

        if (cached) {
            userName = cached.name;
        } else {
            // Intentar obtener nombre del contacto
            try {
                const contact = await msg.getContact();
                userName = contact.pushname || contact.name || null;
            } catch {
                userName = null;
            }
            userCache.set(clientPhone, { name: userName, lastMessage: new Date() });
        }

        // Detectar si es saludo
        const isGreeting = /^(hola|buenas|buenos|hey|hi|hello|oi|ola)/i.test(userMessage);

        if (isGreeting) {
            const welcome = getWelcomeMessage(userName);
            await msg.reply(welcome);
            console.log('👋 Enviado mensaje de bienvenida');
            return;
        }

        // Procesar mensaje de soporte
        const response = await handleSupportMessage(userMessage, userName, SUPPORT_FORM_URL);

        await msg.reply(response.message);

        if (response.needsHumanSupport) {
            console.log(`🔔 Ticket derivado a humano - Categoría: ${response.category}`);

            // Enviar ticket a Formspree automáticamente
            const ticketSent = await submitTicketToFormspree(
                userName || 'Cliente WhatsApp',
                clientPhone,
                userMessage,
                response.category || 'general'
            );

            if (ticketSent) {
                console.log(`📧 Ticket enviado exitosamente a Formspree`);
            }

            // Opcional: Guardar en Firebase para seguimiento
            try {
                await db.collection('support_tickets').add({
                    phone: clientPhone,
                    name: userName,
                    message: userMessage,
                    category: response.category,
                    timestamp: new Date(),
                    status: 'pending',
                    formspree_sent: ticketSent
                });
            } catch (e) {
                console.warn('⚠️ No se pudo guardar ticket en Firebase');
            }
        } else {
            console.log(`✅ Problema resuelto automáticamente`);
        }

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
        await msg.reply('¡Ups! Tuve un problema técnico. Por favor intentá de nuevo o completá el formulario de soporte.');
    }
});

// Evento: Desconexión
client.on('disconnected', async (reason) => {
    console.error('❌ Bot desconectado:', reason);
    io.emit('status', { estado: 'desconectado', razon: reason });

    setTimeout(() => {
        console.log('🔄 Intentando reconectar...');
        client.initialize();
    }, 5000);
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('🌐 Cliente web conectado');
    socket.emit('status', { estado: 'esperando' });

    socket.on('disconnect', () => {
        console.log('🌐 Cliente web desconectado');
    });
});

// ==================== INICIAR ====================

process.on('SIGINT', async () => {
    console.log('\n👋 Cerrando bot...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Cerrando bot...');
    await client.destroy();
    process.exit(0);
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web en puerto ${PORT}`);
    console.log(`📱 Abrí http://localhost:${PORT} para vincular WhatsApp\n`);

    console.log('🚀 Iniciando cliente WhatsApp...\n');
    client.initialize();
});

