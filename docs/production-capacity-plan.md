# AI Scam Shield — Plan preliminar de capacidad y costes de producción

**Fecha:** 21 de noviembre de 2026  
**Estado:** Documento de trabajo para revisión por Codex; **no aprobado para implementación**.  
**Rama de trabajo local:** `agents/v3-laragon-integration`  
**Ubicación prevista:** `docs/production-capacity-plan.md`

## 1. Objetivo y alcance

Preparar el lanzamiento de AI Scam Shield y diseñar una evolución viable hasta **10.000 usuarios registrados**. Esta cifra **no significa 10.000 usuarios simultáneos**. Se requiere validar el tráfico, la concurrencia, los costes de análisis de IA, el almacenamiento, la seguridad y los mecanismos de control de gasto a partir del código real.

Este documento reúne hipótesis y cifras tratadas en la conversación. **Los precios indicados son referencias preliminares, no presupuestos confirmados**; Codex debe contrastarlos con documentación oficial vigente, región, moneda, impuestos y límites del plan antes de tomar decisiones. No deducir la arquitectura actual únicamente de este documento.

## 2. Servicios identificados en el proyecto (pendientes de contrastar con configuración real)

- **API:** Render (se ha utilizado el dominio `ai-scam-shield.onrender.com`).
- **Base de datos:** Neon, PostgreSQL, región AWS Londres según el contexto anterior.
- **Suscripciones:** RevenueCat, integrado o previsto para la gestión de compras/suscripciones.
- **Desarrollo local:** Laragon, Docker, PostgreSQL y Ollama según el contexto del proyecto.
- **Procesamiento/servicios de IA mencionados:** Ollama, Hive, Deepgram y DeepL. Verificar cuáles están realmente activos, qué endpoints los utilizan y cómo se factura cada uno.

No se ha verificado desde este chat el plan contratado, configuración de producción, métricas, arquitectura vigente ni consumo real de los servicios.

## 3. Google Play: pruebas cerradas previas al lanzamiento

### Situación

- Se recibió un rechazo de acceso a producción de Google Play el **18/10/2026**, solicitando pruebas cerradas adicionales y evidencias más sólidas de participación y feedback.
- Google establece requisitos mínimos de participación para determinadas cuentas personales, pero **no debe presentarse la apertura diaria de la app por cada tester como una obligación oficial universal**.
- En la revisión anterior se observaron **12 testers inscritos**, pero una actividad real baja (aproximadamente **2 usuarios activos mensuales** en el periodo analizado). Inscripción no equivale a uso efectivo.
- Publicaciones en comunidades gratuitas de Reddit: `r/AndroidAppTesters` y `r/20AndroidTesters` verificadas como visibles públicamente; `r/AndroidClosedTesting` retirada y pendiente de moderación; `r/GooglePlayClosedTest` pendiente de aprobación; `r/12TesterTeam` aplazada. No se ha confirmado captación efectiva por estas vías.

### Servicios de pago a evaluar (precios orientativos, sin contratación ni garantía verificada)

| Servicio | Precio mencionado | Oferta/garantía anunciada por el proveedor | Verificación pendiente |
|---|---:|---|---|
| Testers Community | USD 15–25, pago único | 15 testers, 14 días, feedback; anuncia reembolso por rechazo | Condiciones exactas, rechazos previos, pruebas de uso |
| 12 Testers Community | USD 14,99–25, pago único | Paquetes de 12+/15+/20+ testers; seguimiento, repetición o reembolso anunciados | Términos, identidad y actividad de testers |
| TestFi | USD 39,99–49,99, pago único | 16–20 testers, informes y reposición/repetición bajo condiciones | Alcance de la garantía y calidad del feedback |
| 12 Real Testers | USD 49, campaña | 14 testers y seguimiento; QA escrito adicional | Coste final y alcance del seguimiento |
| 12 Testers 14 Day | USD 10, oferta anunciada | 14 testers durante 16 días; repetición/reembolso condicionado | Vigencia, compatibilidad con Flutter y términos |

Enlaces para verificar antes de contratar:

- https://www.testerscommunity.com/
- https://12testerscommunity.com/
- https://www.testfi.app/pricing
- https://12realtesters.com/
- https://www.12testers14day.com/

**Criterios de aceptación:** admitir una nueva solicitud después de un rechazo previo; compatibilidad con el Google Group/track existente; pruebas de uso real; feedback específico y exportable; reposición de bajas; cláusulas de reembolso por escrito. **Ningún proveedor puede garantizar la aprobación de Google.**

## 4. Infraestructura actual: referencias de precio

### Render — API

| Tipo de instancia | CPU/RAM referenciales | Precio de referencia |
|---|---|---:|
| Free | CPU compartida / 512 MB | USD 0/mes |
| Starter | 0,5 CPU / 512 MB | USD 7/mes |
| Standard | 1 CPU / 2 GB | USD 25/mes |
| Pro | 2 CPU / 4 GB | USD 85/mes |
| Pro Plus | 2 CPU / 8 GB | USD 135/mes |

Referencia de conversación: en un workspace Hobby, **5 GB/mes de salida incluidos** y **USD 0,15/GB adicional**. Confirmar si sigue vigente y cómo se contabilizan transferencias a otros servicios. El plan del workspace es distinto del tamaño de instancia.  
Fuente oficial para revalidar: https://render.com/pricing

**Hipótesis inicial:** Standard (~USD 25/mes) como punto de partida para pruebas de carga; **no es una garantía de capacidad**.

### Neon — PostgreSQL

Referencias preliminares: Free con límites de consumo; Launch a **USD 0,106/CU-h**, almacenamiento a **USD 0,35/GB-mes**; Scale a **USD 0,222/CU-h**. Verificar política de autosuspend, cómputo, ramas, backups, transferencia, conexiones y límites.  
Fuente oficial: https://neon.com/pricing

Ejemplos **solo de cómputo + almacenamiento** para Launch, sin otros conceptos:

| Cómputo | Datos | Subtotal hipotético |
|---:|---:|---:|
| 100 CU-h | 2 GB | USD 11,30/mes |
| 300 CU-h | 5 GB | USD 33,55/mes |
| 720 CU-h | 10 GB | USD 79,82/mes |
| 1.440 CU-h | 20 GB | USD 159,64/mes |

**No migrar PostgreSQL sin identificar primero un cuello de botella o ventaja económica demostrable.**

### RevenueCat — suscripciones

Referencia preliminar: tramo gratuito hasta **USD 2.500 de ingresos mensuales rastreados (MTR)** y tarifa anunciada del **1%** cuando se supera el umbral. **Revisar la base exacta de facturación y condiciones vigentes**, pues el cálculo simplificado del 1% sobre todos los MTR podría no representar la factura real.  
Fuente oficial: https://www.revenuecat.com/pricing/

La cifra de 10.000 usuarios registrados **no obliga por sí misma** a contratar un plan de pago: el factor relevante es el MTR y los servicios contratados. Considerar por separado comisiones de Google Play, impuestos y reembolsos.

## 5. Alternativas de alojamiento para comparar

| Plataforma | Referencia inicial | Ventajas | Riesgos y validaciones |
|---|---|---|---|
| Render | Standard ~USD 25/mes | Despliegue gestionado y continuidad operativa | Coste de egress, memoria, concurrencia |
| Railway | Desde USD 5/mes de consumo mínimo Hobby, sujeto a uso | Docker y despliegue sencillo | Facturación variable, límites de red y recursos |
| Google Cloud Run | Facturación por uso | Escalado automático, útil con tráfico irregular | Arranques en frío, límites, red, conexión a PostgreSQL |
| Hetzner Cloud | VPS desde ~EUR 5,49/mes en la referencia anterior | Coste fijo potencialmente menor, centros europeos | Administración propia, backups, parches, seguridad, HA |
| Supabase Pro | Desde ~USD 25/mes | PostgreSQL gestionado y servicios integrados | Migración desde Neon, cuotas adicionales |

Consultar tarifas oficiales, región europea, backups, transferencia, observabilidad, protección DDoS, disponibilidad y SLA. No comparar solo precio nominal de CPU/RAM; incorporar horas de administración y recuperación.

Fuentes de partida: https://railway.com/pricing · https://cloud.google.com/run/pricing · https://www.hetzner.com/cloud/ · https://supabase.com/pricing

## 6. Modelo de demanda: editable, no medido

Variables de ejemplo:

- Usuarios registrados: **10.000**.
- Porcentaje activo diario (DAU): **20%** → **2.000 DAU**.
- Análisis por usuario activo y día: **2**.
- Peticiones HTTP por análisis: **5**.
- Tamaño medio de respuesta HTTP: **50 KB**.
- Mes de cálculo: **30 días**.

Cálculos:

```text
DAU = usuarios_registrados × tasa_actividad_diaria
analisis_mes = DAU × analisis_por_dia × 30
peticiones_mes = analisis_mes × peticiones_por_analisis
salida_respuestas_GB ≈ peticiones_mes × KB_por_respuesta / 1_000_000

10.000 × 0,20 = 2.000 DAU
2.000 × 2 × 30 = 120.000 análisis/mes
120.000 × 5 = 600.000 peticiones/mes
600.000 × 50 KB = ~30 GB de respuestas/mes
```

Este modelo **no incluye** subida de imágenes, audio o vídeo, descargas, reintentos, colas, conexiones persistentes, cachés, tráfico a terceros ni picos horarios. **Las solicitudes por segundo medias no sirven para dimensionar los picos de concurrencia**.

Para multimedia, 10.000 vídeos de 20 MB implican ~200 GB de **entrada**; la salida, transcodificación y almacenamiento se calculan aparte. Revisar límites de payload, timeouts, streaming y borrado de ficheros temporales.

## 7. Coste de IA: principal incógnita económica

El coste por análisis depende de la función concreta (texto, URL, imagen, audio, vídeo), tamaño de entrada, proveedor, modelo, número de llamadas, duración, caché y tasa de error/reintento.

**Ejemplo matemático, NO precio real de ningún proveedor:**

| Análisis/mes | Si cada análisis costara USD 0,01 |
|---:|---:|
| 10.000 | USD 100 |
| 50.000 | USD 500 |
| 120.000 | USD 1.200 |
| 300.000 | USD 3.000 |

**Prioridad para Codex:** identificar la cadena real de proveedores por endpoint, tarifas, límites y coste estimado por tipo de análisis. No inferir que Ollama local es gratuito en producción: si requiere GPU/CPU dedicada, esa infraestructura también cuesta dinero.

## 8. Presupuestos ilustrativos, sin IA ni impuestos

| Concepto | Inicio | Crecimiento | Mayor carga |
|---|---:|---:|---:|
| Render API | USD 25 | USD 85 | USD 135 |
| Neon (ejemplo de consumo) | USD 11,30 | USD 33,55 | USD 79,82 |
| Tráfico Render adicional (supuesto) | USD 5 | USD 20 | USD 50 |
| RevenueCat (si se mantiene en tramo gratuito) | USD 0 | USD 0 | USD 0 |
| **Subtotal ilustrativo** | **USD 41,30/mes** | **USD 138,55/mes** | **USD 264,82/mes** |

No representa una cotización ni una capacidad demostrada. Añadir IA, almacenamiento multimedia, correo, alertas, logs, backups, comisiones de Play Store, IVA y contingencia.

## 9. Auditoría técnica solicitada a Codex

**Primera fase: solo análisis, sin modificar código ni infraestructura.**

1. Inspeccionar rama local `agents/v3-laragon-integration` y el estado del working tree; **no hacer commit, push, merge ni checkout sin autorización**.
2. Identificar stack efectivo, puntos de entrada, despliegue, Dockerfiles, configuración de Render y Neon, variables de entorno **sin exponer secretos**.
3. Inventariar endpoints y flujos de análisis: texto/URL/imagen/audio/vídeo, llamadas a terceros, tamaño de payloads, timeouts, almacenamiento temporal, colas y reintentos.
4. Verificar integración real de RevenueCat: validación de entitlement, webhooks, sincronización y comportamiento ante fallos.
5. Comprobar seguridad y privacidad: autenticación, cuotas por usuario/plan, rate limiting, límites de tamaño, expiración/borrado de archivos, retención de datos, logs sin datos sensibles y cumplimiento RGPD.
6. Evaluar pool de conexiones PostgreSQL, índices, consultas críticas, paginación, migraciones, backups y restauración.
7. Proponer escenarios de carga **medibles**: 100, 1.000 y 10.000 usuarios registrados, con DAU y picos explícitos; estimar RPS, p95/p99, RAM, CPU y conexiones.
8. Revisar precios **actuales** y condiciones de cada proveedor con enlaces y fecha de consulta. Separar datos confirmados, estimaciones y desconocidos.
9. Construir modelo de costes por tipo de análisis y plan gratuito/pago; identificar riesgo de abuso y límites de gasto.
10. Entregar un informe priorizado de cambios, riesgos, coste mensual y plan de pruebas. **Solicitar aprobación antes de implementar**.

### Entregables esperados de Codex

- Inventario técnico **basado en archivos y rutas concretas**.
- Matriz de costes con escenarios bajo/medio/alto y supuestos editables.
- Estimación de coste por análisis y por usuario activo, con límites de gasto.
- Propuesta de capacidad y plan de pruebas de carga reproducible.
- Lista de decisiones pendientes y dependencias de despliegue.
- Recomendación argumentada de mantener Render + Neon o migrar, incluyendo coste operativo.

## 10. Decisiones abiertas

- ¿Cuántos análisis diarios permite cada plan (gratuito, premium)?
- ¿Qué porcentaje de usuarios activos y concurrentes esperamos realmente?
- ¿Qué proveedores de IA estarán habilitados en producción y con qué tarifas?
- ¿Qué tamaños y duración máximos admitiremos para imágenes, audio y vídeo?
- ¿Dónde se almacenan archivos y durante cuánto tiempo?
- ¿Qué SLO de latencia, disponibilidad y recuperación necesitamos?
- ¿Qué límites de gasto y alertas de consumo estableceremos?
- ¿Qué moneda, región e impuestos aplican a cada proveedor?

---

**Nota para Codex:** este archivo documenta hipótesis de planificación, no decisiones de arquitectura ni instrucciones de ejecución. Verifica contra el repositorio local y los proveedores antes de recomendar cambios. Mantén el trabajo en la rama actual y no modifiques código hasta recibir confirmación expresa.
