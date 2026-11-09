# تقرير فحص وتسليم — Let's Relax (relax.sa)

**تاريخ الفحص:** 2026-11-09  
**النطاق:** الباك إند `Relax.sa-api` + الفرونت إند `Relax.sa` (النسخة الحالية، النسخة المحمّلة من GitHub، وحالة GitHub).  
**منهجية:** فحص فعلي للملفات، تشغيل قاعدة البيانات والـ API، تنفيذ Build/Test/Lint، اختبار مسارات الـ Auth فعليًا، ومقارنة الفروع والنسخ. لم يتم الاعتماد على الذاكرة أو على الادعاءات المكتوبة.

---

## 1. الحكم النهائي المختصر

| # | الادعاء | الحكم | الدليل |
|---|---------|-------|--------|
| 1 | بنينا الباك إند من الصفر (NestJS + PostgreSQL + Prisma) | ✅ **صحيح** | NestJS 11 + Prisma 6 + PostgreSQL، 57 ملفًا متتبعًا، 3 Commits |
| 2 | 30+ جدول في قاعدة البيانات | ✅ **صحيح** | 64 Model في Prisma، و65 جدولًا فعليًا في PostgreSQL |
| 3 | 10+ APIs موثقة في Swagger | ⚠️ **على الحد** | 10 عمليات في 9 مسارات فقط، وكلها ظاهرة في `/docs` |
| 4 | نظام دخول OTP زي نتفليكس وأمازون | ⚠️ **جزئي** | الباك إند كامل (OTP مجزّأ + محاولات + Cooldown)، لكن SMS وهمي `console` وليس مزوّدًا حيًا |
| 5 | JWT آمنة (15 دقيقة + 30 يوم) | ✅ **صحيح** | Access = 900 ثانية، Refresh = 29 يومًا و23:59:59 في قاعدة البيانات |
| 6 | 6 أدوار مستخدمين | ⚠️ **جزئي** | 6 أدوار RBAC + 12 صلاحية في DB، لكن `UserRole` نفسه 3 قيم فقط، والفرونت لا يستخدم الصلاحيات |
| 7 | ربطنا الفرونت بالباك (بيانات حقيقية) | ❌ **غير صحيح** | الاتصال الحقيقي موجود في `AuthContext` فقط. كل باقي الصفحات Mock / localStorage |
| 8 | الدخول شغال فعليًا والبيانات من الداتابيز | ⚠️ **جزئي** | مسارات API تعمل 100%، وكود الواجهة موصول، لكن واجهة الأدمن لا تملك دخولًا حقيقيًا، والانتقال في المعاينة لم يكتمل |
| 9 | شلنا Firebase القديم والكود الميت | ❌ **غير صحيح** | `src/firebase/firebase.js` و`src/services/auth.service.js` موجودان، و`firebase` ما زال في `package.json`، والمفاتيح في `.env` |
| 10 | لقينا مفتاح SMS حي وشلناه | ❌ **غير مثبت** | لا يوجد أي أثر لمفتاح SMS حي في الباك إند أو تاريخ Git. الموجود `SMS_PROVIDER=console` |
| 11 | رفعنا Rate Limit عشان نقدر نختبر | ⚠️ **جزئي** | تم رفع OTP request من 5 إلى 100/دقيقة محليًا فقط (تغيير غير مُودَع). الباقي كما هو |
| 12 | صلحنا مشكلة Prisma مع نظام التشغيل | ⚠️ **غير موثق** | `binaryTargets = ["native", "debian-openssl-3.0.x"]` موجود، لكن لا يوجد سجل لعطل أو إصلاح محدد |
| 13 | اختبرنا كل حاجة ونجحت (0 أخطاء) | ❌ **غير صحيح** | الباك: Build ✅ و7/7 Unit Tests فقط. الفرونت: Build ✅ لكن Lint به **61 خطأ**. لا توجد E2E |
| 14 | سرعة الاستجابة 28ms | ⚠️ **غير مؤكد** | القياس الفعلي: HTTP 3.8–33ms، وDB latency 1–5ms. لا يوجد Benchmark يثبت 28ms |

**الخلاصة:** الباك إند أساس قوي وصحيح فعليًا، لكن الادعاءات المتعلقة بـ«الربط الكامل» و«إزالة Firebase» و«صفر أخطاء» و«28ms» غير صحيحة أو غير موثقة. الفرونت إند ما زال في معظمه Mock، والنسخة الموجودة على GitHub/المحمّلة بها خلط بين كود API قديم وكود واجهة يستخدم OTP وهمي.

---

## 2. ما تم التحقق منه فعليًا (أدلة التشغيل)

### 2.1 الباك إند

- `npm run build` → **نجح**.
- `npm test` → **7/7 نجحت** (اختبارات `phone.util` فقط).
- قاعدة البيانات: تم تشغيل PostgreSQL محلي على المنفذ `55432`، وتطبيق الـ Migrations:
  - `20261108120726_init`
  - `20261108144359_phase2_orders_teams_addresses`
- عدد الجداول: **65** جدولًا في `public` (يشمل `_prisma_migrations`).
- عدد الـ Models: **64**، وعدد الـ Enums: **28**.
- الـ Seed: **6 أدوار** + **12 صلاحية** + مستخدمون (Admin + 3 Staff + عميلة).
- Swagger: **9 مسارات / 10 عمليات**:
  - 7 Auth + `GET/PATCH /users/me` + `GET /health`.

### 2.2 اختبار الدخول الفعلي (Backend E2E)

تم اختبار السيناريو كاملًا بـ `curl`:

1. `POST /auth/otp/request` لرقم `0501234567` → **200** وأعاد `devCode` لأن `OTP_DEV_MODE=true`.
2. إعادة الطلب فورًا → **429 `OTP_TOO_FREQUENT`** (Cooldown 60 ثانية يعمل).
3. `POST /auth/otp/verify` بالكود الصحيح → **200** وأعاد `accessToken` + `refreshToken` + بيانات العميلة.
4. فك تشفير الـ JWT: `exp - iat = 900 ثانية` = **15 دقيقة**.
5. `GET /auth/me` و`GET /users/me` بالتوكن → **200** وبيانات حقيقية من DB.
6. `POST /auth/refresh` → **200**، ومدة الـ Refresh في DB = **29 يومًا و23:59:59**.
7. `POST /auth/login` للأدمن `admin@relax.sa` → **200** مع **12 صلاحية**.
8. كود OTP خاطئ → **401 `OTP_INVALID`**.

### 2.3 قياس السرعة

- `GET /health`: زمن HTTP الكلي **3.8ms – 33ms**.
- `latencyMs` الداخلي لقاعدة البيانات: **1ms – 5ms**.
- **لا يوجد** أي دليل على «28ms» كرقم ثابت أو موثق.

### 2.4 الفرونت إند

- `npm run build` → **نجح** (543 Module، 5.38 ثانية)، لكن الحزمة **996.77KB** مع تحذير >500KB.
- `npm run lint` → **61 خطأ** (متغيرات غير مستخدمة، `setState` داخل `useEffect`…).
- **لا توجد** اختبارات فرونت إند.
- `node_modules/.bin/vite` موجود والبناء يعمل؛ المشكلة القديمة «vite غير موجود» لم تعد قائمة.

---

## 3. تفصيل الادعاءات

### 3.1 الباك إند — ✅ صحيح
- 57 ملفًا متتبعًا، 3 Commits، NestJS 11، Prisma 6، PostgreSQL.
- بنية Modules: `auth`, `users`, `health` فقط حتى الآن.
- الباقي (Bookings, Orders, Services, Cities, Admin, CMS, Reports) **غير منفّذ على مستوى API**، لكن معظمه موجود كـ Schema.

### 3.2 الجداول — ✅ صحيح
- 64 Model / 65 جدولًا، وتشمل: `Booking`, `Order`, `Payment`, `Invoice`, `Team`, `StaffBlockedTime`, `Address`, `Wallet`, `LoyaltyAccount`, `Coupon`, `GiftCard`, `CmsPage`, `Ticket`… إلخ.

### 3.3 الـ APIs — ⚠️ على الحد
- «10+» غير متحقق بوضوح: العدد الفعلي **10 عمليات** في **9 مسارات**.
- كلها موثقة في Swagger، لكنها **Auth + Profile فقط**، ولا يوجد أي API للخدمات أو الحجوزات أو الأوردرات أو الأدمن.

### 3.4 OTP — ⚠️ جزئي
**ما يعمل:**
- كود 4 أرقام، صلاحية 300 ثانية، Cooldown 60 ثانية، 3 محاولات، تخزين Hash مع Pepper.
- Rate Limit: 100/دقيقة للطلب (محليًا)، 10/دقيقة للتحقق.
- `OTP_DEV_MODE` يعيد الكود في الـ Response للتطوير.

**ما ينقص:**
- `SMS_PROVIDER=console` فقط. لا يوجد Taqnyat/Msegat مفعّل، ولا مفاتيح حقيقية.
- لا توجد واجهة «نسيت كلمة المرور» ولا Endpoint لاستعادة كلمة المرور رغم وجود جدول `PasswordResetToken`.
- الأدمن ليس له رقم جوال في الـ Seed (`phone = null`)، لذا **لا يمكنه الدخول عبر OTP**؛ يدخل فقط بـ Email/Password.
- واجهة الدخول الحالية تعرض OTP فقط ولا تعرض نموذج Email/Password، أي أن الأدمن في الواجهة مضطر لاستخدام «Demo Login» الوهمي.

### 3.5 JWT — ✅ صحيح
- Access: 15 دقيقة (`JWT_ACCESS_TTL=15m`).
- Refresh: 30 يومًا (`JWT_REFRESH_TTL_DAYS=30`)، ويُخزَّن مجزّأً في DB مع Rotation وإمكانية `logout-all`.

### 3.6 الأدوار — ⚠️ جزئي
- **6 أدوار RBAC**: `super-admin`, `management`, `customer-service`, `accountant`, `supervisor`, `branch-manager`.
- **12 صلاحية** موزعة عليهم.
- **لكن** `enum UserRole` في Prisma يحتوي 3 قيم فقط: `CUSTOMER`, `STAFF`, `ADMIN`.
- الفرونت إند لا يقرأ الصلاحيات ولا يبني عليها الواجهة؛ يفحص `role` فقط.

### 3.7 الربط بالباك — ❌ غير صحيح
- `src/context/AuthContext.jsx` هو **الملف الوحيد** الذي يستدعي API.
- `AdminContext.jsx` (556 سطرًا) + `mockAdminData.js` (606 أسطر) + `BookingContext` كلها تعتمد على `localStorage` وبيانات وهمية.
- صفحة الأدمن بها 12 Tab، لكن لا يوجد بها «الأوردرات» منفصلة، ولا Calendar، ولا فلاتر متقدمة.
- لا توجد صفحة استعادة كلمة مرور.
- `BookingModal` لا يدعم «عدد المستفيدات» ولا «مدة الخدمة» ولا «اختيار الأخصائية».

### 3.8 الدخول — ⚠️ جزئي
- **الباك إند:** يعمل بالكامل (تم إثباته بـ curl).
- **الفرونت الحالي:** `LoginPage` يستدعي `requestOtp` ثم `verifyOtp` بشكل صحيح، ويحفظ التوكن.
- **المشكلة:** اختبار المتصفح داخل بيئة المعاينة توقف عند أنيميشن `framer-motion` (`AnimatePresence mode="wait"`) فلم تظهر شاشة إدخال الرمز، رغم أن طلب الـ API رجع **200** والكود وصل. هذا سلوك بيئة معاينة/RAF وليس خطأ منطقيًا، لكنه يحتاج تأكيدًا في متصفح عادي.
- **مشكلة حقيقية:** `quickDemoLogin` ما زال موجودًا، ويسمح بالدخول كأدمن/أخصائية/عميلة بدون أي تحقق. هذا «دخول وهمي» بجوار الدخول الحقيقي.
- **مشكلة حقيقية:** الأدمن لا يستطيع الدخول من الواجهة الحالية لأنها لا تعرض Email/Password.

### 3.9 Firebase — ❌ غير صحيح
- الملفان موجودان:
  - `src/firebase/firebase.js`
  - `src/services/auth.service.js`
- `firebase` ما زال Dependency في `package.json`.
- `.env` المحلي ما زال يحتوي مفاتيح مشروع `supermarket-ce9ce`.
- `origin/main` (آخر Ref معروف) **يتتبع `.env` نفسه**، أي أن المفاتيح موجودة في تاريخ Git.
- **يلزم:** حذف الملفين والحزمة، وإزالة `.env` من التتبع، و**تدوير المفاتيح** لأن حذفها من الـ HEAD لا يمحوها من التاريخ.

### 3.10 مفتاح SMS — ❌ غير مثبت
- لا يوجد `TAQNYAT_BEARER_TOKEN` ولا `MSEGAT_API_KEY` بقيمة حقيقية.
- `.env` الحالي لا يحتوي أي مفتاح SMS.
- البحث في تاريخ Git عن `MSEGAT` و`TAQNYAT` لم يرجع أي Commit.
- لذلك: **لا دليل** على وجود مفتاح حي تمت إزالته. الموجود هو `SMS_PROVIDER=console`.

### 3.11 Rate Limit — ⚠️ جزئي
- Global: **120/دقيقة**.
- OTP request: كان **5/دقيقة**، وتم رفعه محليًا إلى **100/دقيقة** (تغيير غير مُودَع في `src/modules/auth/auth.controller.ts`).
- OTP verify: **10/دقيقة**.
- Login: **10/دقيقة**.
- Refresh: **30/دقيقة**.
- `docs/API-CONTRACT.md` ما زال يقول **5 req/min** → تعارض مع الكود.

### 3.12 Prisma + نظام التشغيل — ⚠️ غير موثق
- `binaryTargets = ["native", "debian-openssl-3.0.x"]` موجود في `schema.prisma`.
- هذا إعداد سليم للنشر على Debian/OpenSSL 3، لكنه **ليس دليلًا** على «مشكلة تم إصلاحها».
- لا يوجد Issue أو Commit يوثق العطل الأصلي.

### 3.13 الاختبارات — ❌ «صفر أخطاء» غير صحيح
- Backend: Build ✅ + 7 Unit Tests فقط (ملف واحد).
- لا توجد Integration/E2E Tests للحجوزات أو الصلاحيات أو التضارب.
- Frontend: Build ✅ لكن Lint به **61 خطأ**.
- لا توجد اختبارات فرونت ولا QA يدوي موثق.

### 3.14 السرعة — ⚠️ غير مؤكد
- القياسات أعلاه لا تدعم رقمًا ثابتًا 28ms.
- لا يوجد Load Test أو قياس تحت ضغط.
- 28ms قد يكون رقمًا من قياس عابر، لكنه غير موثق ولا يمكن اعتباره SLA.

---

## 4. مقارنة النسخ الأربع (تعارضات)

### 4.1 الوضع الحالي

| النسخة | المرجع | الحالة |
|--------|--------|--------|
| الباك إند | `/home/mohamed/Documents/Relax.sa-api` | 3 Commits + **تعديلات غير مُودَعة** (Schema + Migration + Trigger + Docs) |
| الفرونت الحالي | `feat/auth-integration` @ `b0950c8` | AutContext API + LoginPage API، لكن ما زال به Demo/Firebase/Mock |
| الفرونت المحمّل | `/home/mohamed/Pictures/موقع /Relax.sa-main` | AuthContext به API، لكن LoginPage تستخدم OTP وهمي |
| GitHub | `origin/main` @ `4415fc1` (Ref قديم) | AuthContext كله Mock + LoginPage OTP وهمي + `.env` متتبع |

### 4.2 تعارضات الباك إند الداخلية

| # | التعارض | الملفات |
|---|---------|---------|
| 1 | `schema.prisma` يقول «EXCLUDE constraint»، لكن التنفيذ الفعلي **Trigger** | `prisma/schema.prisma` مقابل `prisma/sql/02-booking-overlap.sql` |
| 2 | `README.md` يقول «partial unique index»، و`SETUP.md` يقول Trigger | `README.md` / `docs/SETUP.md` |
| 3 | `API-CONTRACT` يقول OTP 5/دقيقة، والكود 100/دقيقة | `docs/API-CONTRACT.md` مقابل `auth.controller.ts` |
| 4 | Docs تقول PostgreSQL 16، والبيئة الفعلية 18 | `README.md` / `docs/SETUP.md` |
| 5 | `REQUIREMENTS-ANALYSIS` يقول الفرونت 100% Mock، لكن `AuthContext` أصبح API | `docs/REQUIREMENTS-ANALYSIS.md` |
| 6 | 3 قيم `UserRole` مقابل 6 أدوار RBAC | `schema.prisma` / `seed.ts` |
| 7 | `.env` لا يحتوي `CORS_ORIGINS`، والافتراضي `localhost:5173` فقط | فتح الفرونت على `127.0.0.1` فشل بـ CORS |

### 4.3 تعارضات الفرونت إند بين النسخ

| البند | GitHub (Ref) / ZIP | الفرع الحالي |
|-------|--------------------|--------------|
| `AuthContext` | ZIP: API + `loginWithPassword` | الحالي: API فقط بدون `loginWithPassword` |
| `LoginPage` | GitHub/ZIP: OTP وهمي (`Math.random`) | الحالي: API حقيقي |
| `.env` | متتبع بمفاتيح Firebase | غير متتبع + `.env.example` |
| `.gitignore` | لا يحمي `.env` | يحمي `.env` |
| `mockAdminData.js` | أصلي | **معدّل وغير مُودَع** |

**النتيجة:** النسخة المحمّلة من GitHub ليست متسقة: `AuthContext` بها كود API، لكن `LoginPage` تستخدم OTP وهمي، أي أن الدخول فيها **لا يعمل**. الفرع المحلي الحالي أصلح `LoginPage` لكنه **لم يُرفع**، كما أنه لا يحتوي `loginWithPassword` الموجود في النسخة المحمّلة.

### 4.4 مشكلة GitHub
- `git fetch origin` يفشل: **لا توجد Credentials**.
- لذلك `origin/main` Ref قديم (`4415fc1`) ولا يعكس بالضرورة ما على GitHub الآن.
- **الباك إند ليس له Remote أصلًا**، أي أنه غير موجود على GitHub.
- لا شيء مما تم عمله في الفرعين `chore/security-cleanup` و`feat/auth-integration` تم رفعه.

---

## 5. المرحلة التالية

### 5.1 المرحلة الفورية (أسبوع تقريبًا)

1. **إغلاق الباك إند الحالي:**
   - مراجعة الـ Rate Limit: إعادة OTP request إلى قيمة آمنة (5–10/دقيقة) أو جعلها Environment Variable.
   - تحديث `API-CONTRACT` و`README` و`SETUP` لتطابق الكود والـ Trigger.
   - توحيد تعليق `schema.prisma` مع Trigger بدل EXCLUDE.
   - إضافة `CORS_ORIGINS` إلى `.env` المحلي.
   - Commit للتغييرات الحالية (Schema + Migration + Trigger + Docs).

2. **إنشاء Remote للباك إند** على GitHub ودفع `main`، ثم فتح فرع للتطوير.

3. **تنظيف الفرونت:**
   - حذف `src/firebase/firebase.js` و`src/services/auth.service.js`.
   - حذف `firebase` من `package.json`.
   - إزالة `.env` من التتبع نهائيًا + تدوير مفاتيح Firebase.
   - حذف `quickDemoLogin` أو تقييده بـ `import.meta.env.DEV`.
   - إضافة نموذج Email/Password للأدمن في `LoginPage`.
   - إصلاح 61 خطأ Lint.

4. **دمج ورفع الفرونت:**
   - دمج `chore/security-cleanup` + `feat/auth-integration` في `main`.
   - حل تعارض `AuthContext` مع النسخة المحمّلة (الاحتفاظ بـ `loginWithPassword` + `requestOtp` معًا).
   - دفع `main` وتحديث GitHub.

### 5.2 المرحلة الثانية (2–3 أسابيع)

**الهدف:** تحويل الكتالوج والحجز من Schema إلى APIs حقيقية.

1. **Catalog APIs:**
   - Cities / Districts / Coverage Areas.
   - Services / Service Variants / Add-ons / Per-city prices.
   - Packages / Package Items.

2. **Booking Engine APIs:**
   - Availability (Working Hours + Vacations + Blocked Times + Blackout Dates).
   - Create Booking مع `startAt/endAt` و`beneficiariesCount` و`teamId`.
   - منع التضارب عبر Trigger الحالي + اختبارات Integration.
   - Cancel / Reschedule.

3. **Orders & Payments (بداية):**
   - Order / OrderItem / Payment / Invoice.
   - Payment Link + Partial Payments + Pay-on-service.
   - Wallet / Loyalty / Coupon / Gift Card.

4. **ربط الفرونت:**
   - صفحة الخدمات والباقات تقرأ من API.
   - `BookingModal` يدعم المدة + عدد المستفيدات + اختيار الأخصائية.
   - صفحة «مواعيدي» تقرأ الحجوزات الحقيقية.

### 5.3 المراحل التالية (حسب الخطة الحالية)

| المرحلة | المحتوى | المدة |
|---------|---------|-------|
| 3 | Payments / Wallet / Loyalty / Promotions | 3 أسابيع |
| 4 | Admin APIs (Bookings/Orders منفصلة، Staff, Teams, Calendar, Filters) | 4 أسابيع |
| 5 | Notifications (SMS/WhatsApp/Email) + CMS + FAQ | 2 أسابيع |
| 6 | Reports + Complaints + Audit | 2 أسابيع |
| 7 | Frontend integration كامل + i18n | 3 أسابيع |
| 8 | Security / Performance / QA / Deployment | 2 أسابيع |

**الإجمالي:** 16–18 أسبوعًا للنطاق الكامل (كما تم الاتفاق).

---

## 6. ما يجب إضافته تحديدًا

### Backend
- Modules جديدة: `cities`, `services`, `packages`, `bookings`, `orders`, `payments`, `staff`, `teams`, `admin`, `cms`, `reports`, `notifications`.
- Endpoints ناقصة:
  - `POST /auth/password/forgot` + `POST /auth/password/reset`.
  - `GET /cities`, `GET /services`, `GET /packages`.
  - `GET /availability`, `POST /bookings`, `PATCH /bookings/:id/cancel`, `PATCH /bookings/:id/reschedule`.
  - `POST /orders`, `POST /payments`, `GET /invoices`.
  - Admin CRUD + Calendar + Reports.
- اختبارات Integration/E2E للحجز والتضارب والصلاحيات.
- إضافة `CORS_ORIGINS` في `.env`.

### Frontend
- إزالة Firebase و`quickDemoLogin` وMock Admin.
- نموذج Email/Password للأدمن.
- صفحة «نسيت كلمة المرور».
- ربط Services / Packages / Booking / Client Portal / Admin بـ API.
- إضافة تبويب «الأوردرات» منفصلًا عن «الحجوزات» أول القائمة.
- Calendar (يومي/أسبوعي) + فلاتر متقدمة.
- دعم عدد المستفيدات والمدة واختيار الأخصائية.
- إصلاح Lint + إضافة Code Splitting للحزمة (>500KB).

---

## 7. قرارات مطلوبة منك

1. **GitHub:** هل لديك Access لدفع الباك إند؟ أم ننشئ Repo جديد؟
2. **الفرع الذي ندمجه:** `feat/auth-integration` أم نعيد بناء الدمج مع النسخة المحمّلة؟
3. **الأدمن:** هل ندعم Email/Password في الواجهة، أم نضيف رقم جوال للأدمن ليستخدم OTP؟
4. **Rate Limit النهائي:** 5 أم 10 أم 100 طلب/دقيقة؟
5. **SMS:** Taqnyat أم Msegat؟ ومتى تتوفر المفاتيح؟
6. **الأسعار والمصفوفة النهائية للأدوار** (ما زالت مدخلات مطلوبة).

---

## 8. ملاحظات أمنية عاجلة

- مفاتيح Firebase موجودة في `.env` **وفي تاريخ Git** → يجب تدويرها فورًا، وليس فقط حذفها.
- `OTP_DEV_MODE=true` يجب أن يكون `false` في الإنتاج.
- `quickDemoLogin` يسمح بالدخول كأدمن بدون تحقق → يجب حذفه أو تقييده.
- Rate Limit المرفوع إلى 100/دقيقة يسهّل تخمين OTP → يجب إعادته لقيمة آمنة قبل النشر.
- `scripts/local-db.sh` يستخدم Trust Auth على 55432 → للتطوير فقط.
