/**
 * Configuración de Firebase Admin para AlasExpress
 *
 * SEGURIDAD: Este bot SOLO funciona con el proyecto alasexpresspro
 * No se puede usar con otros proyectos de Firebase
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Proyecto permitido - SOLO alasexpresspro puede usar este bot
const ALLOWED_PROJECT_ID = 'alasexpresspro';

let db: admin.firestore.Firestore;

function initializeFirebase(): void {
    if (admin.apps.length > 0) {
        db = admin.firestore();
        return;
    }

    let serviceAccount: any;

    // Intentar cargar desde variable de entorno (para producción)
    if (process.env.FIREBASE_CREDENTIALS_JSON) {
        try {
            console.log('📦 Cargando credenciales desde variable de entorno...');
            serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
        } catch (e) {
            console.error('❌ Error parseando FIREBASE_CREDENTIALS_JSON');
            process.exit(1);
        }
    } else {
        // Intentar cargar desde archivo local (para desarrollo)
        const credentialsPath = path.join(__dirname, '..', '..', 'firebase-credentials.json');
        if (fs.existsSync(credentialsPath)) {
            console.log('📦 Cargando credenciales desde archivo local...');
            serviceAccount = require(credentialsPath);
        } else {
            console.error('❌ No se encontraron credenciales de Firebase');
            console.error('   Configura FIREBASE_CREDENTIALS_JSON o crea firebase-credentials.json');
            process.exit(1);
        }
    }

    // 🔒 VALIDACIÓN DE SEGURIDAD: Solo permitir proyecto alasexpresspro
    if (serviceAccount.project_id !== ALLOWED_PROJECT_ID) {
        console.error('');
        console.error('╔════════════════════════════════════════════════════════════╗');
        console.error('║  ❌ ERROR DE SEGURIDAD                                     ║');
        console.error('║                                                            ║');
        console.error('║  Este bot es exclusivo para AlasExpress.                   ║');
        console.error('║  No se puede usar con otros proyectos de Firebase.         ║');
        console.error('║                                                            ║');
        console.error(`║  Proyecto detectado: ${serviceAccount.project_id.padEnd(35)}║`);
        console.error(`║  Proyecto requerido: ${ALLOWED_PROJECT_ID.padEnd(35)}║`);
        console.error('╚════════════════════════════════════════════════════════════╝');
        console.error('');
        process.exit(1);
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();

    console.log('✅ Firebase Admin inicializado');
    console.log(`📁 Proyecto: ${serviceAccount.project_id}`);
    console.log('🔒 Verificación de seguridad: OK');
}

initializeFirebase();

export { db, admin };

