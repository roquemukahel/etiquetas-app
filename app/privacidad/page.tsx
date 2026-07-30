import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad — Qovento',
};

export default function Privacidad() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link href="/" className="text-2xl leading-none">
            &larr;
          </Link>
          <h1 className="text-xl font-display font-semibold">Política de Privacidad</h1>
        </header>

        <p className="text-xs text-muted dark:text-dark-text-secondary">Última actualización: julio de 2026</p>

        <Seccion titulo="1. Quiénes somos">
          <p>
            Qovento es un software de gestión para locales de compra, venta y reparación de dispositivos móviles.
            Esta política explica qué datos recolectamos, para qué los usamos y con quién los compartimos. Ante
            cualquier consulta, escribinos a{' '}
            <a href="mailto:qovento@gmail.com" className="text-accent dark:text-dark-accent underline">
              qovento@gmail.com
            </a>
            .
          </p>
        </Seccion>

        <Seccion titulo="2. Dos tipos de datos que manejamos">
          <p>
            Es importante distinguir dos capas: por un lado, tus datos como <strong>usuario de Qovento</strong>{' '}
            (tu cuenta, tu negocio); por otro, los datos de <strong>tus propios clientes</strong> que vos cargás en
            el sistema para llevar tu negocio (nombre, DNI, teléfono de la gente que te compra o te vende
            dispositivos). Para esos datos de tus clientes, vos sos el responsable del tratamiento ante ellos —
            Qovento solo los aloja y procesa por tu cuenta, como encargado del tratamiento.
          </p>
        </Seccion>

        <Seccion titulo="3. Qué datos recolectamos">
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>
              <strong>De tu cuenta:</strong> email, contraseña (guardada de forma encriptada, nunca en texto plano),
              nombre del negocio, teléfono, dirección, redes sociales que cargues.
            </li>
            <li>
              <strong>De tus clientes (cargados por vos):</strong> nombre, apellido, domicilio, email, teléfono, DNI.
            </li>
            <li>
              <strong>De los dispositivos:</strong> modelo, IMEI, número de serie, fotos que subas para autocompletar
              datos.
            </li>
            <li>
              <strong>De pagos:</strong> los números de tarjeta NUNCA pasan por nuestros servidores — los procesa
              directamente Lemon Squeezy, nuestro proveedor de cobros. Nosotros solo guardamos el estado de tu
              suscripción (activa, vencida, etc.).
            </li>
            <li>
              <strong>Técnicos:</strong> dirección IP, identificadores de sesión, y una validación anti-bots
              (Cloudflare Turnstile) al iniciar sesión o registrarte.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="4. Para qué usamos estos datos">
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>Para darte acceso al Servicio y hacerlo funcionar (autenticación, guardado de tu información).</li>
            <li>Para procesar tu suscripción y avisarte sobre el estado de tu cuenta.</li>
            <li>Para prevenir fraude, abuso y accesos no autorizados.</li>
            <li>Para dar soporte cuando nos escribís con una consulta.</li>
            <li>
              Cuando usás la función de leer datos de un dispositivo a partir de una foto, esa imagen se envía a
              Anthropic (proveedor de inteligencia artificial) únicamente para extraer el texto visible (modelo,
              IMEI, capacidad); no se usa para entrenar modelos ni se guarda más allá de lo necesario para procesar
              ese pedido.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="5. Con quién compartimos datos">
          <p>Usamos estos proveedores externos (encargados del tratamiento) para operar Qovento:</p>
          <ul className="list-disc pl-5 flex flex-col gap-2 mt-2">
            <li><strong>Supabase</strong> — base de datos y autenticación de usuarios.</li>
            <li><strong>Vercel</strong> — alojamiento (hosting) de la aplicación web.</li>
            <li><strong>Lemon Squeezy</strong> — procesamiento de pagos de la suscripción.</li>
            <li><strong>Cloudflare</strong> — protección anti-bots (Turnstile) en login y registro.</li>
            <li><strong>Anthropic</strong> — lectura automática de fotos de pantallas de dispositivos (opcional, solo si usás esa función).</li>
          </ul>
          <p className="mt-2">
            No vendemos tus datos ni los de tus clientes a terceros, ni los usamos con fines publicitarios.
          </p>
        </Seccion>

        <Seccion titulo="6. Dónde se almacenan los datos">
          <p>
            Estos proveedores pueden alojar información en servidores fuera de Argentina (por ejemplo, en Estados
            Unidos). En todos los casos exigimos que cumplan estándares de seguridad adecuados para el tipo de datos
            que manejan.
          </p>
        </Seccion>

        <Seccion titulo="7. Seguridad">
          <p>
            Cada negocio solo puede ver y modificar sus propios datos (aislamiento a nivel de base de datos, no solo
            de la aplicación). Las contraseñas se guardan encriptadas, las conexiones viajan cifradas (HTTPS), y
            limitamos los intentos de inicio de sesión para dificultar ataques automatizados.
          </p>
        </Seccion>

        <Seccion titulo="8. Cuánto tiempo guardamos los datos">
          <p>
            Mientras tu cuenta esté activa. Si cancelás tu suscripción, tus datos quedan guardados por un tiempo
            razonable por si querés reactivar la cuenta; si querés que los eliminemos antes, escribinos y lo
            gestionamos.
          </p>
        </Seccion>

        <Seccion titulo="9. Tus derechos">
          <p>
            Conforme a la Ley 25.326 de Protección de Datos Personales de Argentina, tenés derecho a acceder,
            rectificar, actualizar o solicitar la supresión de tus datos personales. Para ejercer estos derechos,
            escribinos a{' '}
            <a href="mailto:qovento@gmail.com" className="text-accent dark:text-dark-accent underline">
              qovento@gmail.com
            </a>
            . La Agencia de Acceso a la Información Pública (AAIP), órgano de control de la Ley 25.326, tiene la
            atribución de atender reclamos relacionados con el incumplimiento de las normas de protección de datos
            personales.
          </p>
        </Seccion>

        <Seccion titulo="10. Menores de edad">
          <p>Qovento no está dirigido a menores de edad. No recolectamos a sabiendas datos de menores.</p>
        </Seccion>

        <Seccion titulo="11. Cambios a esta política">
          <p>
            Podemos actualizar esta política ocasionalmente. Si el cambio es significativo, te lo vamos a notificar
            por email o dentro del Servicio.
          </p>
        </Seccion>

        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Ver también nuestros{' '}
          <Link href="/terminos" className="text-accent dark:text-dark-accent underline">
            Términos y Condiciones
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium">{titulo}</h2>
      <div className="text-sm text-muted dark:text-dark-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}
