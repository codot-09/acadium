# Telegram integratsiyasi: Acadium MVP arxitekturasi

## Tasdiqlangan texnik yo‘nalish

Telegram Mini Apps rasmiy hujjatiga ko‘ra, ilova `initData` orqali foydalanuvchi kontekstini qabul qilishi mumkin. Acadium bu ma’lumotni faqat server tomonda bot tokeni bilan tekshirgandan keyin qabul qiladi. Tekshirilgan `user.id`, `first_name`, `last_name` va `username` qiymatlari profil jadvaliga saqlanadi; shu sabab Web App ichida qo‘shimcha forma talab qilinmaydi.

Telegram Bot API rasmiy hujjatida bot yangilanishlarini HTTPS webhook manziliga qabul qilish uchun `setWebhook` qo‘llab-quvvatlanishi ko‘rsatilgan. Acadium bot handleri faqat Telegramdan kelgan maxfiy webhook sarlavhasini tekshirganidan so‘ng yangilanishlarni qayta ishlaydi. Bot tokeni server sirlarida saqlanadi va brauzerga uzatilmaydi.

## Ishlash modeli

| Qatlam | Vazifa | Xavfsizlik talabi |
| --- | --- | --- |
| Telegram Mini App | `initData`ni o‘qiydi va profiling endpointiga uzatadi | Telegram ichida bo‘lmagan preview uchun xavfsiz demo rejimi qo‘llanadi |
| Acadium backend | Imzoni tekshiradi, profil va chat tarixini saqlaydi, rol asosidagi API beradi | Bot tokeni va LLM kalitlari faqat serverda |
| Telegram webhook | Guruh va shaxsiy chatdagi update’larni qabul qiladi | Maxfiy webhook tokeni sarlavhasini tekshirish |
| Notification service | Topshiriq/session yaratishda tegishli chat IDlarga bot orqali xabar yuboradi | Faqat opt-in yoki ilgari botni ishga tushirgan foydalanuvchilarga yuborish |

## Ishga tushirishga bog‘liq tashqi qadamlar

Bot tokeni kiritilgach, production domenidagi `/api/telegram/webhook` manzili BotFather orqali webhook sifatida ro‘yxatdan o‘tkaziladi. Guruh sessionlarida botni administrator qilish, xabarlar huquqi va privacy mode sozlamalari guruhdagi kerakli eventlar ko‘rinishi uchun Telegram tomonida yakunlanadi.

## Manbalar

- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- Telegram Bot API: https://core.telegram.org/bots/api


## Production sozlash checklisti

1. BotFather’da bot yarating yoki mavjud botni tanlang va tokenni Acadium Secrets bo‘limidagi `TELEGRAM_BOT_TOKEN` maydoniga kiriting.
2. Acadium Secrets bo‘limida tasodifiy, uzun `TELEGRAM_WEBHOOK_SECRET` qiymatini saqlang. Bu qiymat Telegram webhook so‘rovidagi `X-Telegram-Bot-Api-Secret-Token` sarlavhasi bilan bir xil bo‘lishi kerak.
3. Production domeningiz uchun webhook URL quyidagicha bo‘ladi: `https://YOUR_ACADIUM_DOMAIN/api/telegram/webhook`. BotFather yoki Telegram Bot API `setWebhook` metodi orqali URLni `secret_token` bilan ro‘yxatdan o‘tkazing.
4. Botni kerakli guruhga administrator qilib qo‘shing. Session xabarlarini yuborish, savollarni ko‘rish va o‘quvchi javoblarini qabul qilish uchun zarur guruh huquqlarini yoqing. Guruhdagi barcha xabarlarni ko‘rish talab qilinsa, BotFather’da privacy mode sozlamasini tekshiring.
5. Web App manzilini BotFather’da Mini App sifatida sozlang. Foydalanuvchi Mini App’ni Telegram ichida ochganda `initData` avtomatik tekshiriladi va chat ID, ism hamda username bazaga yoziladi.
6. Tekshiruv: `getWebhookInfo` orqali webhook manzilini va oxirgi xatoni ko‘ring; Acadium testlari `TELEGRAM_BOT_TOKEN`ni `getMe` orqali va webhook secret qoidalarini lokal test orqali tekshiradi.

Webhook secret majburiy: sarlavha yo‘q yoki noto‘g‘ri bo‘lgan so‘rovlar 401 bilan rad etiladi. Teacher roli ham serverda administrator tomonidan berilgan profil roli bilan cheklangan; oddiy foydalanuvchi UI tugmasi orqali o‘zini teacher qila olmaydi.

## Group lesson arxitekturasi uchun rasmiy tekshiruv

Telegram Bot API rasmiy hujjatiga ko‘ra, `setWebhook` bot uchun incoming update’larni HTTPS POST orqali qabul qilish imkonini beradi. Group lesson oqimi webhook asosida ishlaydi: `/lesson <slug>` komandasi update’dan olinadi, teacher vakolati groupdagi `administrator` yoki `creator` statusi bilan tekshiriladi, so‘ng lesson session database’da yaratiladi.

Bot groupdagi barcha message eventlarini ko‘rishi uchun privacy mode va admin huquqlari muhim. Production sozlamasida bot guruhga administrator qilib qo‘shiladi; BotFather’dagi privacy sozlamasi groupdagi dars javoblarini qabul qilish talabiga mos qilinadi. `chat_member` update’lari orqali groupga qo‘shilgan yoki chiqqan a’zolarni rosterga sinxronlash mumkin; Telegram hujjatlari bunday update’lar uchun bot administrator bo‘lishi kerakligini ta’kidlaydi.

Manbalar: https://core.telegram.org/bots/api, https://core.telegram.org/bots/features, https://core.telegram.org/bots/api-changelog

## Group lesson foydalanish oqimi

Teacher botni o‘z guruhiga administrator qilib qo‘shadi. Bot webhooki production domeniga o‘rnatilgach, teacher guruhda `/lesson fotosintez-8-sinf` komandasi bilan lessonni boshlaydi. Acadium Telegram API orqali komandani yuborgan foydalanuvchi guruh administratori yoki creator ekanini tekshiradi; keyin sessionni `live` holatida database’ga saqlaydi.

Dars paytida teacher `/ask Fotosintezning asosiy bosqichi nima?` komandasi bilan savol yuboradi. Groupdagi oddiy student xabarlari va `chat_member` qo‘shilish eventlari session rosteriga yoziladi, teacher-student linki idempotent tarzda yaratiladi va participation eventlari Analyze menyusida ko‘rinadi. `/endlesson` sessionni tugatadi va saqlangan student activity keyinchalik teacher dashboardida ishlatiladi.

Guruhdagi eventlar to‘liq ko‘rinishi uchun bot administrator bo‘lishi va Telegram privacy mode sozlamasi group darslari talabiga mos bo‘lishi kerak. Botni guruhga qo‘shish va BotFather sozlamalari teacher tomonidan Telegram’da bajariladi.
