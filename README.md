# Bot de Soporte AlasExpress

## Variables de entorno (.env)
```
GROQ_API_KEY=tu_api_key_de_groq
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
SUPPORT_FORM_URL=https://alasexpressweb.com/soporte
TIMEZONE=America/Argentina/Buenos_Aires
PORT=3000
```

## Comandos
```bash
npm install
npm run build
npm start
```

## Cómo funciona

1. El usuario escribe un problema
2. El bot busca en los documentos de ayuda (`docs/`)
3. Si encuentra solución, la responde
4. Si no encuentra, le pide que llene el formulario de soporte

## Documentos de ayuda

Agregá archivos `.md` en la carpeta `docs/` con soluciones a problemas comunes.
El bot los leerá automáticamente.

Ejemplo: `docs/problema-login.md`
```markdown
# Problema: No puedo iniciar sesión

## Síntomas
- La app muestra "credenciales inválidas"
- Se queda cargando infinito

## Solución
1. Verificá que tu email esté bien escrito
2. Usá "Olvidé mi contraseña" para resetear
3. Asegurate de tener conexión a internet
```

