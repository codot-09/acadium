# Acadium Admin Panel

Acadium admin paneli `/admin` manzilida joylashgan. Kirish credentials server-side environment secrets orqali tekshiriladi; login yoki parol frontend kodiga joylashtirilmaydi. Muvaffaqiyatli login 12 soatlik, `httpOnly`, `sameSite=lax` va production’da `secure` cookie bilan himoyalangan admin session yaratadi.

## Boshqaruv imkoniyatlari

Admin Overview platformadagi Telegram profillari, teacherlar, studentlar, guruhlar, sessionlar, faol Individual subscriptionlar, pending receiptlar va tayyor source fayllari bo‘yicha umumiy KPI’larni ko‘rsatadi. Profiles bo‘limida teacher/student rolini boshqarish, Sessions bo‘limida barcha group lesson tarixini ko‘rish, Subscriptions bo‘limida subscription entitlement statusini boshqarish va Receipts bo‘limida AI tahlilidan o‘tgan cheklarni approve yoki reject qilish mumkin.

Receipt approve qilinganda uning summa qiymati **99 000 UZS** bo‘lsa, receiptId unique constraint va server-side idempotent activation orqali bitta Individual subscription yaratiladi. Bitta receipt qayta yuborilsa fingerprint unique constraint uni 409 bilan rad etadi. Admin actionlar Telegram teacher endpointlaridan alohida, signed admin session orqali authorization qilinadi.

## Xavfsizlik checklisti

Admin login secrets faqat Acadium Secrets konfiguratsiyasida saqlanadi. `ACADIUM_ADMIN_LOGIN` va `ACADIUM_ADMIN_PASSWORD` qiymatlarini repository yoki client bundle ichiga yozmang. Admin cookie’ni browser local storage’ida saqlamang va session tugagach Sign out tugmasidan foydalaning. Receipt reviewda faqat paymentning o‘ziga tegishli fayllardan foydalaning.

Production smoke test uchun `/admin` sahifasini oching, noto‘g‘ri login bilan 401 holatini, to‘g‘ri login bilan Overview KPI’larini, Profiles role actionini va Receipts approve/reject actionlarini tekshiring. Teacher Telegram sessionlari va existing source/lesson oqimlari admin paneldan mustaqil ishlashda davom etadi.

## Test rejimi

Local va CI full suite external Telegram networkga bog‘lanmaydi: `pnpm test` token secret konfiguratsiyasini tekshiradi, `getMe` live check esa faqat `RUN_EXTERNAL_INTEGRATION_TESTS=true pnpm test` bilan opt-in ishlaydi. Bu offline testlarni deterministik saqlaydi, real Telegram smoke verificationni esa alohida controlled bosqichga ajratadi.
