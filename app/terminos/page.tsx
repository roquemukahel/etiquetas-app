import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones — Qovento',
};

export default function Terminos() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link href="/" className="text-2xl leading-none">
            &larr;
          </Link>
          <h1 className="text-xl font-display font-semibold">Términos y Condiciones de Servicio</h1>
        </header>

        <p className="text-xs text-muted dark:text-dark-text-secondary">Última actualización: julio de 2026</p>

        <Seccion titulo="1. Aceptación de estos Términos">
          <p>
            Estos Términos y Condiciones (los &quot;Términos&quot;) regulan el uso de Qovento (el &quot;Servicio&quot;),
            un software de gestión para locales de compra, venta y reparación de dispositivos móviles. Al crear una
            cuenta o usar el Servicio, aceptás quedar obligado por estos Términos. Si no estás de acuerdo, no uses
            Qovento.
          </p>
        </Seccion>

        <Seccion titulo="2. Descripción del Servicio">
          <p>
            Qovento es una plataforma web que permite administrar stock, clientes, ventas, órdenes, servicio técnico,
            planes de canje y compras de dispositivos para un negocio. El Servicio se ofrece &quot;tal cual&quot;
            (as is) y puede ser modificado, ampliado o discontinuado en cualquier momento, con aviso razonable cuando
            el cambio afecte funciones ya en uso.
          </p>
        </Seccion>

        <Seccion titulo="3. Registro y cuenta">
          <p>
            Para usar Qovento necesitás crear una cuenta con un email y contraseña válidos. Sos responsable de
            mantener la confidencialidad de tus credenciales y de toda actividad que ocurra bajo tu cuenta. Debés
            tener al menos 18 años o la mayoría de edad legal en tu país para registrarte.
          </p>
        </Seccion>

        <Seccion titulo="4. Suscripción y pagos">
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>Toda cuenta nueva accede a un período de prueba gratuito de 14 días, sin necesidad de tarjeta.</li>
            <li>
              Al finalizar la prueba (o si decidís suscribirte antes), se cobra automáticamente el valor mensual
              vigente del plan, mediante nuestro procesador de pagos (actualmente Lemon Squeezy), hasta que canceles.
            </li>
            <li>Podés cancelar tu suscripción en cualquier momento desde Configuración → Suscripción.</li>
            <li>
              <strong>No se realizan reembolsos</strong> por períodos ya pagados, incluso si cancelás antes de que
              termine el mes en curso. Vas a seguir teniendo acceso al Servicio hasta el final del período ya
              abonado.
            </li>
            <li>
              Si un pago falla y no se regulariza, tu acceso al Servicio puede suspenderse hasta que se resuelva.
            </li>
            <li>Los precios pueden actualizarse; te vamos a avisar con anticipación razonable antes de que te afecte.</li>
          </ul>
        </Seccion>

        <Seccion titulo="5. Uso aceptable">
          <p>Al usar Qovento, te comprometés a no:</p>
          <ul className="list-disc pl-5 flex flex-col gap-2 mt-2">
            <li>Usar el Servicio para actividades ilegales o fraudulentas.</li>
            <li>Intentar acceder a datos de otros negocios que usan Qovento sin autorización.</li>
            <li>
              Interferir con el funcionamiento del Servicio (ataques, ingeniería inversa, sobrecarga intencional,
              scraping automatizado no autorizado).
            </li>
            <li>Revender o sublicenciar el Servicio a terceros sin nuestro consentimiento por escrito.</li>
          </ul>
        </Seccion>

        <Seccion titulo="6. Tus datos y los datos de tus clientes">
          <p>
            Vos sos el único responsable de la información que cargás en Qovento, incluidos los datos personales de
            tus propios clientes (nombre, domicilio, DNI, teléfono, email, IMEI de sus dispositivos, etc.). Al cargar
            esos datos, declarás que contás con el consentimiento o base legal necesaria para hacerlo conforme a la
            normativa de protección de datos que te resulte aplicable. Qovento actúa como encargado del tratamiento
            de esos datos (los almacena y procesa por tu cuenta), no como responsable de esa información.
          </p>
        </Seccion>

        <Seccion titulo="7. Propiedad intelectual">
          <p>
            El software, diseño, marca y logo de Qovento son propiedad de su titular. Vos conservás la propiedad de
            los datos que cargás (stock, clientes, órdenes, etc.). Te damos una licencia limitada, no exclusiva e
            intransferible para usar el Servicio mientras tu cuenta esté activa.
          </p>
        </Seccion>

        <Seccion titulo="8. Disponibilidad y limitación de responsabilidad">
          <p>
            Hacemos nuestro mejor esfuerzo para mantener el Servicio disponible y funcionando correctamente, pero no
            garantizamos disponibilidad ininterrumpida ni libre de errores. En la medida permitida por la ley, no
            somos responsables por daños indirectos, pérdida de ganancias o de datos derivados del uso o
            imposibilidad de uso del Servicio. Te recomendamos exportar o respaldar periódicamente la información
            crítica de tu negocio.
          </p>
        </Seccion>

        <Seccion titulo="9. Terminación">
          <p>
            Podés dejar de usar Qovento y cancelar tu suscripción cuando quieras. Nos reservamos el derecho de
            suspender o cerrar cuentas que incumplan estos Términos, incluyendo falta de pago sostenida o uso
            indebido del Servicio.
          </p>
        </Seccion>

        <Seccion titulo="10. Cambios a estos Términos">
          <p>
            Podemos actualizar estos Términos ocasionalmente. Si el cambio es significativo, te lo vamos a
            notificar por email o dentro del Servicio antes de que entre en vigencia.
          </p>
        </Seccion>

        <Seccion titulo="11. Ley aplicable y jurisdicción">
          <p>
            Estos Términos se rigen por las leyes de la República Argentina. Cualquier disputa se someterá a la
            jurisdicción de los tribunales ordinarios de San Miguel de Tucumán, provincia de Tucumán, Argentina.
          </p>
        </Seccion>

        <Seccion titulo="12. Contacto">
          <p>
            Ante cualquier consulta sobre estos Términos, escribinos a{' '}
            <a href="mailto:qovento@gmail.com" className="text-accent dark:text-dark-accent underline">
              qovento@gmail.com
            </a>
            .
          </p>
        </Seccion>

        <p className="text-xs text-muted dark:text-dark-text-secondary">
          Ver también nuestra{' '}
          <Link href="/privacidad" className="text-accent dark:text-dark-accent underline">
            Política de Privacidad
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
