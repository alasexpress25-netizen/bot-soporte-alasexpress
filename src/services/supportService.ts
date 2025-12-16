/**
 * Servicio de IA para Soporte - Económico y eficiente
 *
 * Usa búsqueda por palabras clave + IA solo cuando es necesario
 * para minimizar el consumo de tokens.
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';

let groq: Groq | null = null;

// Modelo pequeño y económico
const MODEL_NAME = 'llama-3.1-8b-instant';

// URL de Formspree para enviar tickets
const FORMSPREE_URL = 'https://formspree.io/f/meoyrqyq';

// Cache de documentos de ayuda
let helpDocuments: Map<string, { title: string; content: string; keywords: string[] }> = new Map();

export function initializeAI(): void {
    if (!process.env.GROQ_API_KEY) {
        console.warn('⚠️ GROQ_API_KEY no configurada. IA deshabilitada.');
        return;
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log(`✅ IA inicializada (${MODEL_NAME})`);

    // Cargar documentos de ayuda
    loadHelpDocuments();
}

/**
 * Carga los documentos de ayuda desde la carpeta docs/
 */
function loadHelpDocuments(): void {
    const docsPath = path.join(__dirname, '..', '..', 'docs');

    if (!fs.existsSync(docsPath)) {
        console.log('📁 Carpeta docs/ no existe, creándola...');
        fs.mkdirSync(docsPath, { recursive: true });
        return;
    }

    const files = fs.readdirSync(docsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const filePath = path.join(docsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extraer título (primera línea con #)
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : file.replace('.md', '');

        // Extraer palabras clave del contenido
        const keywords = extractKeywords(content.toLowerCase());

        helpDocuments.set(file, { title, content, keywords });
    }

    console.log(`📚 ${helpDocuments.size} documentos de ayuda cargados`);
}

/**
 * Extrae palabras clave de un texto
 */
function extractKeywords(text: string): string[] {
    // Palabras comunes a ignorar
    const stopWords = new Set([
        'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'por', 'para',
        'que', 'es', 'se', 'no', 'si', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus',
        'le', 'ya', 'o', 'este', 'ha', 'me', 'sin', 'sobre', 'ser', 'tiene', 'también',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
        'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
        'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with'
    ]);

    const words = text
        .replace(/[^\w\sáéíóúñ]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

    return [...new Set(words)];
}

/**
 * Busca en los documentos de ayuda por coincidencia de palabras clave
 * Esta es la primera línea de defensa - NO usa IA, es gratis
 */
function searchInDocuments(query: string): { document: string; content: string; score: number } | null {
    const queryKeywords = extractKeywords(query.toLowerCase());

    let bestMatch: { document: string; content: string; score: number } | null = null;
    let bestScore = 0;

    for (const [filename, doc] of helpDocuments) {
        let score = 0;

        // Contar coincidencias de palabras clave
        for (const keyword of queryKeywords) {
            if (doc.keywords.includes(keyword)) {
                score += 2;
            }
            // Búsqueda parcial
            if (doc.keywords.some(k => k.includes(keyword) || keyword.includes(k))) {
                score += 1;
            }
        }

        // Bonus si el título contiene alguna palabra clave
        for (const keyword of queryKeywords) {
            if (doc.title.toLowerCase().includes(keyword)) {
                score += 3;
            }
        }

        if (score > bestScore && score >= 3) {
            bestScore = score;
            bestMatch = { document: filename, content: doc.content, score };
        }
    }

    return bestMatch;
}

/**
 * Analiza el mensaje del usuario para detectar si es un problema técnico
 * Usa IA pero con prompt muy corto para minimizar tokens
 */
async function analyzeMessage(message: string): Promise<{
    isProblem: boolean;
    category: string;
    summary: string;
}> {
    if (!groq) {
        // Sin IA, asumir que todo es un problema
        return { isProblem: true, category: 'general', summary: message };
    }

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Analiza si el mensaje es un problema técnico. Responde SOLO JSON:
{"isProblem":true/false,"category":"login|pago|app|envio|cuenta|otro","summary":"resumen corto"}`
                },
                { role: 'user', content: message }
            ],
            model: MODEL_NAME,
            temperature: 0,
            max_tokens: 100,
            response_format: { type: 'json_object' }
        });

        return JSON.parse(completion.choices[0].message.content || '{}');
    } catch (error) {
        console.error('Error analizando mensaje:', error);
        return { isProblem: true, category: 'general', summary: message };
    }
}

/**
 * Genera una respuesta humanizada basada en el documento encontrado
 * Usa IA pero con contexto limitado
 */
async function generateResponse(
    userMessage: string,
    documentContent: string,
    userName: string | null
): Promise<string> {
    if (!groq) {
        // Sin IA, devolver el documento tal cual
        return documentContent;
    }

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Sos un asistente de soporte de AlasExpress. Respondé de forma amigable y concisa.
Usuario: ${userName || 'Cliente'}
Usá la información del documento para responder. Sé breve (máximo 3-4 oraciones).
Si la solución tiene pasos, listalos de forma clara.`
                },
                {
                    role: 'user',
                    content: `Problema del usuario: "${userMessage}"\n\nDocumento de ayuda:\n${documentContent.substring(0, 1500)}`
                }
            ],
            model: MODEL_NAME,
            temperature: 0.5,
            max_tokens: 300
        });

        return completion.choices[0].message.content || documentContent;
    } catch (error) {
        console.error('Error generando respuesta:', error);
        return documentContent;
    }
}

export interface SupportResponse {
    found: boolean;
    message: string;
    needsHumanSupport: boolean;
    category?: string;
}

/**
 * Procesa un mensaje de soporte y devuelve la respuesta
 */
export async function handleSupportMessage(
    userMessage: string,
    userName: string | null,
    formUrl: string
): Promise<SupportResponse> {
    // Paso 1: Buscar en documentos (GRATIS - sin IA)
    const docMatch = searchInDocuments(userMessage);

    if (docMatch && docMatch.score >= 5) {
        // Encontramos una buena coincidencia
        console.log(`📄 Documento encontrado: ${docMatch.document} (score: ${docMatch.score})`);

        // Generar respuesta humanizada (usa poca IA)
        const response = await generateResponse(userMessage, docMatch.content, userName);

        return {
            found: true,
            message: response,
            needsHumanSupport: false
        };
    }

    // Paso 2: Analizar si realmente es un problema (usa poca IA)
    const analysis = await analyzeMessage(userMessage);

    if (!analysis.isProblem) {
        // No es un problema técnico, responder amablemente
        return {
            found: true,
            message: `¡Hola${userName ? ` ${userName}` : ''}! 👋 Soy el asistente de AlasExpress.\n\n¿En qué puedo ayudarte? Si tenés algún problema con la app, contame y voy a hacer lo posible por resolverlo. 😊`,
            needsHumanSupport: false
        };
    }

    // Paso 3: Si hay coincidencia parcial, usarla
    if (docMatch) {
        const response = await generateResponse(userMessage, docMatch.content, userName);
        return {
            found: true,
            message: response + `\n\n¿Esto resolvió tu problema? Si no, podés completar el formulario de soporte: ${formUrl}`,
            needsHumanSupport: false,
            category: analysis.category
        };
    }

    // Paso 4: No encontramos solución - derivar a humano
    return {
        found: false,
        message: `${userName ? `${userName}, ` : ''}entiendo tu problema pero necesito que un humano lo revise. 🙏

Para que podamos ayudarte, por favor completá el formulario de soporte:
👉 https://alasexpressweb.com

📝 *IMPORTANTE:*
• En el asunto escribí: *ATENCION HUMANA*
• Dejá tu *número de teléfono completo* (con código de área)
• Describí tu problema lo más detallado posible

📞 Nos vamos a comunicar con vos por WhatsApp lo antes posible.

¡Gracias por tu paciencia! 💪`,
        needsHumanSupport: true,
        category: analysis.category
    };
}

/**
 * Respuesta de bienvenida
 */
export function getWelcomeMessage(userName: string | null): string {
    const greeting = new Date().getHours() < 12 ? '¡Buen día' :
                     new Date().getHours() < 19 ? '¡Buenas tardes' : '¡Buenas noches';

    return `${greeting}${userName ? `, ${userName}` : ''}! 👋

Soy el asistente de soporte de *AlasExpress*. 🚀

Contame tu problema y voy a intentar ayudarte.

Algunos temas en los que puedo ayudarte:
• Problemas de login
• Problemas con pagos
• Errores en la app
• Consultas sobre envíos
• Problemas con tu cuenta

📱 *¿No sabés usar la app?*
Seguinos en Instagram: *@alasexpress.25* donde tenemos tutoriales y guías.`;
}

/**
 * Recargar documentos de ayuda
 */
export function reloadDocuments(): void {
    helpDocuments.clear();
    loadHelpDocuments();
}

/**
 * Envía un ticket a Formspree cuando el bot no puede resolver el problema
 */
export async function submitTicketToFormspree(
    name: string,
    phone: string,
    message: string,
    category: string
): Promise<boolean> {
    try {
        const response = await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: name || 'Cliente WhatsApp',
                email: `whatsapp_${phone}@bot.alasexpress.com`,
                phone: phone,
                message: `[TICKET BOT - ${category.toUpperCase()}]\n\nTeléfono: ${phone}\nCategoría: ${category}\n\nMensaje del cliente:\n${message}`,
                _subject: `🤖 Ticket Bot WhatsApp - ${category}`
            })
        });

        if (response.ok) {
            console.log(`📧 Ticket enviado a Formspree para ${phone}`);
            return true;
        } else {
            console.error('❌ Error enviando a Formspree:', await response.text());
            return false;
        }
    } catch (error) {
        console.error('❌ Error enviando ticket:', error);
        return false;
    }
}

