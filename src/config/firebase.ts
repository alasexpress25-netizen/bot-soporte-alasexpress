/**
 * Configuración de Firebase Admin para AlasExpress
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

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

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();

    console.log('✅ Firebase Admin inicializado');
    console.log(`📁 Proyecto: ${serviceAccount.project_id}`);
}

initializeFirebase();

export { db, admin };

