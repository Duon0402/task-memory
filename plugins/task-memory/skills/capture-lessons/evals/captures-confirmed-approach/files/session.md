# Session transcript — task SHOP-70 (branch features/SHOP-70)

[assistant] The desktop client models bonus items as {id, title, amount}. Before copying it I read the backend command BonusItemQueryCmd: it returns {itemCode, itemName, amount}. I modelled the mobile type on the command's fields.
[user] Đúng rồi, cứ lấy theo cmd BE như vậy, desktop hay đặt khác.
[assistant] On the list, some rows imported by the backend batch job have itemName = null, so the UI showed "undefined".
[assistant] Tried trimming / defaulting to empty string — rows looked blank. Final fix: show itemCode when itemName is missing.
[user] ok chuẩn, data import thiếu tên là chuyện thường, chỗ nào cũng nên fallback vậy.
[assistant] Also renamed the screen title to "Khoản thưởng" as the user asked.
[user] push đi.
[assistant] Pushed 9f8e7d6.
