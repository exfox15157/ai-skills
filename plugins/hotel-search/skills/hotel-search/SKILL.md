---
name: hotel-search
description: Tìm và so giá cuối khách sạn trên m.booking.com, Agoda, iVIVU bằng tài khoản đã đăng nhập của user, trừ coupon và hoàn tiền thẻ tín dụng. Dùng khi user nhờ tìm/so sánh khách sạn, "tìm khách sạn", "so giá phòng", "giá cuối booking/agoda/ivivu".
compatibility: Designed for Claude Code or claude.ai with the Claude in Chrome extension; needs m.booking.com, Agoda and iVIVU tabs the user is logged into.
license: MIT
---

# Hotel search – giá cuối thật trên m.booking.com, Agoda, iVIVU

Mục tiêu: tìm khách sạn theo yêu cầu (khu vực hoặc khách sạn cụ thể, ngày, số khách), lấy **giá thực trả** (giá cuối ở trang checkout, đã trừ coupon, sau đó trừ hoàn tiền thẻ) trên cả 3 trang, **sau đó mới xếp hạng** và báo cáo.

Có 2 chế độ báo cáo:
- **Chế độ khu vực** (user chỉ nêu khu vực/tiêu chí): **3 bảng so sánh khách sạn (Đáng tiền nhất, Rẻ nhất, Chất lượng)** + **1 bảng ngày linh hoạt**.
- **Chế độ khách sạn chỉ định** (user nêu tên 1 hoặc vài khách sạn cụ thể): vẫn dùng các bảng như bình thường nhưng **bỏ bảng Chất lượng** và các bảng dùng để **so sánh loại phòng/gói** thay vì so sánh khách sạn: **bảng Rẻ nhất** + **bảng Đáng tiền nhất** + **1 bảng ngày linh hoạt** (mỗi khách sạn một bộ bảng nếu user nêu nhiều khách sạn).

## Nguyên tắc bắt buộc

1. **Chỉ làm trong Chrome đã đăng nhập của user (Claude in Chrome).** Không cài hay chạy script/CLI tự quét, không dùng trình duyệt "stealth" né chống bot, không xuất cookie hay phiên đăng nhập ra ngoài, không dùng skill/MCP cộng đồng để scrape OTA. Cách làm này an toàn hơn và giá thấy được chính là giá user sẽ trả.
2. **Booking: tra cứu giá trên `m.booking.com`**, không dùng `www.booking.com` để lấy giá. Bản di động hiện thêm "Giá chỉ trên di động" (đã thấy rẻ hơn 5–17% so với web); các khách sạn khác giá bằng nhau nên không mất gì. **Riêng hyperlink trong báo cáo thì dùng `www.booking.com`** (xem Bước 6).
3. **Không tin giá ở trang danh sách và không xếp hạng theo giá danh sách.** Mọi so sánh, phân loại rẻ nhất/đáng tiền chỉ dựa trên giá thực trả ở Bước 3. Trang danh sách thường lệch rất xa (ví dụ iVIVU ghi 1,89 tr/đêm nhưng giá cuối 4,24 tr/2 đêm).
4. **Không bao giờ thanh toán**, không bấm sang bước cuối ("Kế tiếp: bước cuối cùng", "Hoàn tất đặt phòng"), không nhập số thẻ, không gửi form thông tin cá nhân. Chỉ dừng ở trang tóm tắt giá. Nếu không vào được trang tóm tắt giá (bị chặn), dùng giá tổng đã gồm thuế phí ở trang chi tiết phòng và **ghi rõ trong báo cáo** rằng giá chưa được đối chiếu ở trang checkout.
5. Không đặt dữ liệu cá nhân vào URL. Khi đọc URL bằng JavaScript chỉ trả về phần path/ID (URL đầy đủ chứa session sẽ bị chặn).

## Bước 0 – Kiểm tra đăng nhập (chặn nếu chưa đăng nhập)

Mở 3 trang trong Chrome của user và kiểm tra:
- **m.booking.com**: góc trên hiện tên tài khoản và cấp Genius → đã đăng nhập.
- **Agoda**: trang có nút "Đăng nhập" / "Tạo tài khoản" → **chưa** đăng nhập.
- **iVIVU**: góc trên hiện tên user (không có nút Đăng nhập) → đã đăng nhập.

Nếu **bất kỳ trang nào chưa đăng nhập: DỪNG, không chạy tiếp.** Báo user trang nào chưa đăng nhập, nhờ họ tự đăng nhập (Claude không được nhập mật khẩu), và giải thích lợi ích:
- **Booking – Genius:** giảm thêm tới 10–25% và các ưu đãi như bữa sáng, nâng hạng phòng miễn phí; một số giá chỉ hiện khi đăng nhập ("Đăng nhập để hưởng mức giá dành riêng cho thành viên").
- **Agoda:** giá thành viên/giá bí mật, mã giảm tự áp dụng ở bước thanh toán (đã thấy giảm ~234k cho 1 đơn), điểm thưởng.
- **iVIVU:** giá thành viên, voucher trong tài khoản, tích điểm.
- Chung: giá cuối mình báo khớp với giá user thực trả; tránh phải so lại.

Chỉ chạy tiếp khi user xác nhận đã đăng nhập cả 3.

## Bước 1 – Thông tin đầu vào

Lấy từ yêu cầu và ghi chú sẵn có của user (memory, tài liệu project về du lịch và thẻ tín dụng, nếu có); thiếu thì hỏi:
- **Chế độ:** user nêu tên khách sạn cụ thể → chế độ khách sạn chỉ định; chỉ nêu khu vực/tiêu chí → chế độ khu vực.
- Khu vực hoặc tên khách sạn, ngày nhận/trả phòng, số người lớn, số trẻ và **tuổi trẻ** (bé dưới 2 tuổi nhập tuổi 1).
- Mặc định (chế độ khu vực): **khách sạn từ 4 sao trở lên**, loại *khách sạn* (loại bỏ căn hộ cho thuê trừ khi user muốn), ưu tiên hủy miễn phí; nếu đi cùng em bé thì cần có cũi.
- **Ưu tiên của user:** lấy từ ghi chú du lịch của user (nếu có) và yêu cầu hiện tại để lập danh sách tiện ích user ưu tiên, ví dụ: **phòng có bồn tắm**, bữa ăn miễn phí, spa, vé/ưu tiên khu vui chơi, đưa đón sân bay, kids' club. Đọc lại mỗi lần chạy vì danh sách có thể thay đổi.
- **Bộ thẻ của user:** với mỗi thẻ ghi tỉ lệ hoàn tiền theo nhóm (khách sạn/du lịch hay chi tiêu chung), trần hoàn tiền mỗi kỳ, ngày chốt sao kê, và thẻ có tính phí giao dịch nước ngoài không. Hỏi hoặc tra xem trần hoàn tiền của kỳ sao kê liên quan còn bao nhiêu.
- Kiểm tra 1 lần các ưu đãi ngân hàng/thẻ đang chạy trên từng trang (ví dụ `agoda.com/visavn`, trang khuyến mãi của ngân hàng phát hành thẻ, ưu đãi Visa/Mastercard). Đọc **thời hạn** – nhiều trang vẫn hiển thị dù đã hết hạn.

## Bước 2 – Thu thập riêng ngân sách ứng viên (chưa xếp hạng)

**Chế độ khách sạn chỉ định: bỏ qua bước này** – ứng viên chính là các khách sạn user nêu; chỉ cần tìm trang chi tiết của từng khách sạn trên cả 3 trang (ghi rõ trang nào không bán hoặc hết phòng).

Chế độ khu vực: mục đích bước này chỉ là lập danh sách khách sạn đáng kiểm tra, **chưa đánh giá rẻ hay đáng tiền**. Lấy 8–12 khách sạn đạt tiêu chí (4 sao+, còn phòng cho cả nhà), đa dạng từ mức giá thấp đến cao và điểm đánh giá cao, gộp trùng giữa 3 trang. Giá danh sách chỉ dùng để loại những chỗ rõ ràng vượt xa ngân sách user đã nói.

- **m.booking.com** – URL tìm kiếm:
  `https://m.booking.com/searchresults.vi.html?ss=<khu vực>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=<số người lớn>&group_children=<số trẻ>&age=<tuổi từng trẻ, lặp lại tham số age>&no_rooms=1&nflt=class%3D4%3Bclass%3D5%3Bht_id%3D204`
  (`ht_id=204` = chỉ khách sạn). Cuộn hết trang rồi đọc các thẻ `[data-testid="property-card"]`; ghi nhãn "Giá chỉ trên di động"/"Mobile-only price", "Genius", điểm đánh giá.
- **Agoda** – URL tìm kiếm có `city=<id>&hotelArea=<id>&hotelStarRating=4,5&checkIn=&checkOut=&los=&adults=&children=&childages=`. Kết quả lazy-load: cuộn bằng `window.scrollTo` theo tỉ lệ chiều cao trang rồi đọc `li[data-hotelid]`.
- **iVIVU** – `https://www.ivivu.com/khach-san-<thành phố>?location=<id>&stars=50,40`; ngày và số khách phải chỉnh trên thanh tìm kiếm (mặc định có thể sai, ví dụ 4 người lớn, trẻ 9 tuổi) rồi bấm Tìm kiếm và kiểm tra lại bộ lọc khu vực.

## Bước 3 – Giá thực trả cho từng khách sạn × từng trang × từng thẻ

Với **mỗi khách sạn ứng viên trên mỗi trang có bán**: vào trang chi tiết → chọn phòng → bấm Đặt/Reserve → đọc giá cuối ở trang tóm tắt → **ngay lúc đó** trừ coupon và tính hoàn tiền cho từng thẻ phù hợp, vì cách thanh toán của từng trang/khách sạn quyết định thẻ nào được hoàn. Ghi lại phương án (trang + thẻ) cho giá thực trả thấp nhất của khách sạn.

**Chế độ khách sạn chỉ định:** làm việc trên cho **từng loại phòng và từng gói** (chỉ ăn sáng, ăn sáng + ăn tối, gói kèm vé/combo, hủy miễn phí…) – mỗi loại phòng đủ chỗ cho cả nhà, trên cả 3 trang – để sau đó lấy giá thực trả thấp nhất của từng loại phòng và so giá trị các gói.

Với mỗi phòng, ghi lại luôn **các tiện ích thuộc danh sách ưu tiên của user** (ví dụ có bồn tắm hay chỉ vòi sen) từ mục tiện nghi phòng trên trang (Booking: danh sách tiện nghi phòng; Agoda: "Bồn tắm", "Bồn tắm/vòi sen riêng"; iVIVU: "Xem chi tiết" phòng). Nếu trang không ghi rõ thì ghi "chưa rõ", không đoán.

Ghi lại đủ các thành phần để dựng phép tính ở Bước 6:
- **Giá phòng gốc** (trước thuế/phí, sau giảm Genius/giá thành viên nếu trang hiển thị sẵn trong giá phòng),
- **Thuế/phí** (nếu tách được),
- **Coupon/giảm giá** (nếu có; tên chương trình hoặc thẻ yêu cầu, ví dụ "mã Agoda Visa YRO", "voucher iVIVU"),
- **Giá cuối** = số tiền ở trang checkout,
- **Hoàn tiền thẻ** (nếu có; thẻ nào, tỉ lệ, trần còn lại).

**Giá thực trả = Giá phòng gốc + thuế/phí − coupon = Giá cuối (checkout) − hoàn tiền thẻ.**

### m.booking.com
1. Mở `https://m.booking.com/hotel/vn/<slug>.vi.html?checkin=&checkout=&group_adults=&group_children=&age=&no_rooms=1` (lấy slug từ link thẻ kết quả bằng regex `hotel\/vn\/([a-z0-9-]+)`).
2. Đọc các lựa chọn phòng (giá tổng, hủy miễn phí, bữa sáng, nhãn di động, tiện nghi phòng). Chọn lựa chọn hợp lý (thường hủy miễn phí), bấm "Đặt phòng", rồi bấm thanh "Đặt ngay".
3. Ở trang `secure.booking.com/book.html` đọc khối **"Tóm tắt giá"**: Tổng cộng, giảm Genius/ưu đãi, thuế/phí, lịch thanh toán, hạn hủy, đặt cọc.
4. **Thẻ:** nếu "trả tại chỗ nghỉ" hoặc "khách sạn thu trước khi đến" thì chính khách sạn trừ tiền (MCC 7011) → thẻ hoàn tiền nhóm khách sạn/du lịch chắc chắn được tính nhất, nếu khách sạn nhận loại thẻ đó (nếu chưa rõ, ví dụ với AMEX, ghi "cần hỏi khách sạn có nhận thẻ này").

### Agoda
1. Lấy `propertyId`: gõ tên khách sạn vào ô tìm kiếm trên cùng (click → Ctrl+A → gõ), chọn gợi ý, bấm TÌM; ID nằm ở tham số `selectedproperty` (chỉ trả về số).
2. Mở trang chi tiết: `https://www.agoda.com/vi-vn/accom/property?propertyId=<id>&countryId=38&finalPriceView=1&adults=&children=&rooms=1&checkIn=YYYY-MM-DD&childAges=&travellerType=2&currencyCode=VND&los=<số đêm>`.
3. Cuộn để tải bảng phòng; lọc các dòng tên phòng (`m²Tối đa`), "Ưu đãi N", điều kiện hủy/bữa sáng, tiện nghi phòng. Lưu ý dòng "Vượt quá sức chứa phòng". Giá trên trang chi tiết là **mỗi đêm, chưa gồm thuế**.
4. Dùng `find` lấy nút "Đặt ngay <tên phòng> Ưu đãi N", bấm, đợi ~8 giây. Ở trang `/book/` đọc: Giá phòng, Thuế và phí, giảm giá tự áp dụng, **Giá tiền** (tổng), ngày thanh toán, hạn hủy. Không bấm "Kế tiếp".
5. **Thẻ:** Agoda trả trước thường do Agoda (nước ngoài) thu tiền → có thể mất ~0,8% phí giao dịch nước ngoài và chưa chắc thẻ hoàn tiền du lịch tính giao dịch này vào nhóm khách sạn/du lịch. So với ưu đãi thẻ Visa/Mastercard của Agoda nếu còn hạn (thường tính trên giá phòng trước thuế, chỉ hiện sau khi nhập số thẻ → ghi "chưa xác nhận"). Các ưu đãi này không cộng dồn với hoàn tiền của thẻ khác → chọn phương án thực trả thấp nhất và ghi rõ giả định.

### iVIVU
1. Trên trang danh sách, lọc bằng ô "Tìm tên khách sạn" (hoặc thêm `?keysearch=<tên>`).
2. Nút "Xem phòng" mở tab mới bằng `window.open` (có thể bị chặn): gán `window.open = u => {cap = u}` rồi click để lấy path, sau đó tự mở `https://www.ivivu.com/<path>`.
3. Trang chi tiết hiện giá tổng "Đã bao gồm thuế & phí" cho từng lựa chọn kèm hạn hủy và bữa sáng; dưới giá có dòng "Giá đã bao gồm: Sales tax … / Service charge …" để tách thuế/phí. Đợi ~8 giây cho giá tải xong. Kiểm tra voucher trong tài khoản nếu trang hiện.
4. **Thẻ:** iVIVU là đại lý trong nước, thanh toán VND (thường qua cổng trong nước như VNPAY) → không có phí nước ngoài; MCC của iVIVU chưa kiểm chứng → ghi "chưa xác nhận" nếu dựa vào hoàn tiền nhóm khách sạn/du lịch.

Nếu một trang không có phòng phù hợp hoặc không tải được bảng phòng → ghi rõ trong ghi chú, không đoán giá.

## Bước 4 – Xếp hạng dựa trên giá thực trả

### Chế độ khu vực
Chỉ sau khi có giá thực trả của tất cả ứng viên mới phân loại. Một khách sạn có thể vào nhiều bảng. Mỗi bảng 3–5 khách sạn.

1. **Rẻ nhất** – sắp theo giá thực trả tăng dần.
2. **Đáng tiền nhất** – nhiều giá trị nhất cho giá thực trả, **đánh giá trước hết theo danh sách ưu tiên của user** (Bước 1, ví dụ phòng có bồn tắm), sau đó mới đến các giá trị chung: bữa sáng, diện tích, bếp, hủy miễn phí, tiện ích cho bé (cũi, hồ bơi, kids' club), vị trí, đưa đón.
   - Khách sạn/phòng đáp ứng ưu tiên của user được **cộng điểm rõ rệt**: khi chênh lệch giá thực trả nhỏ, xếp phòng có tiện ích ưu tiên lên trước. Nếu khách sạn có cả phòng có và không có tiện ích ưu tiên, chọn phòng có tiện ích cho bảng này và ghi mức chênh so với phòng rẻ nhất.
   - Ví dụ khác: nếu phòng có ăn sáng chỉ đắt hơn phòng không ăn sáng ít hơn giá bữa sáng mua lẻ thì tính là đáng tiền.
   - Ghi lý do trong cột Ghi chú, nêu rõ ưu tiên nào của user được đáp ứng (ví dụ "có bồn tắm ✓").
3. **Chất lượng** – điểm đánh giá cao (ưu tiên ≥ 9,0 với nhiều đánh giá), 5 sao, thương hiệu uy tín; cũng cộng điểm cho tiện ích thuộc danh sách ưu tiên của user. Sắp theo chất lượng, giá thực trả là yếu tố phụ.

### Chế độ khách sạn chỉ định
Dùng các bảng như chế độ khu vực nhưng **bỏ bảng Chất lượng**, và mỗi dòng là **một loại phòng/gói** của khách sạn đó (không phải một khách sạn):

1. **Rẻ nhất** – **chỉ ghi lựa chọn rẻ nhất của mỗi loại phòng** (giá thực trả thấp nhất trong 3 trang, thường là gói cơ bản như chỉ ăn sáng / không hoàn tiền). Không đưa combo hay gói kèm dịch vụ vào bảng này trừ khi chính nó là lựa chọn rẻ nhất của loại phòng. Sắp theo giá thực trả tăng dần.
2. **Đáng tiền nhất** – chỉ ghi **các gói combo có giá tốt hoặc có tiện ích đi kèm tốt**: gói kèm vé tham quan/cáp treo/khu vui chơi, gói ăn sáng + ăn tối, spa, đưa đón, hủy miễn phí với phụ thu nhỏ, phòng đáp ứng ưu tiên của user (ví dụ bồn tắm, giường đôi cho gia đình có bé)…
   - Với mỗi gói, so với **cách mua lẻ tương đương** (giá phòng rẻ nhất + giá dịch vụ mua riêng) và ghi rõ chênh lệch trong Ghi chú (ví dụ "rẻ hơn mua vé cáp treo lẻ 164k").
   - Chỉ đưa vào bảng nếu gói thực sự lợi hơn mua lẻ, hoặc tiện ích đi kèm đáng giá với mức chênh (nêu lý do). Nếu khách sạn có chi phí bắt buộc ngoài giá phòng (ví dụ vé cáp treo bắt buộc), thêm cột **Tổng gồm chi phí bắt buộc** ở cả 2 bảng để so công bằng.
   - Nêu rõ ưu tiên nào của user được đáp ứng (ví dụ "bồn tắm ✓").

## Bước 5 – Ngày linh hoạt (±1 ngày)

Áp dụng cho **cả 2 chế độ**.
- Chế độ khu vực: các khách sạn đứng đầu mỗi bảng (tối đa 3–4 khách sạn, không trùng).
- Chế độ khách sạn chỉ định: lựa chọn đứng đầu bảng Rẻ nhất và đứng đầu bảng Đáng tiền nhất (và loại phòng đáp ứng ưu tiên của user nếu khác).

Lấy thêm giá thực trả khi **nhận phòng sớm 1 ngày** và **muộn 1 ngày**, **giữ nguyên số đêm**. Chỉ cần kiểm tra trên trang + thẻ đã cho giá thấp nhất ở Bước 3, vẫn theo đúng quy trình Bước 3. Nếu user nói ngày cố định, bỏ qua bước này và ghi một dòng "Ngày cố định – không kiểm tra ngày linh hoạt".

## Bước 6 – Báo cáo

Không dùng 3 cột cho 3 trang. Mỗi dòng chỉ ghi **giá thực trả thấp nhất** tìm được.

### Cột đầu tiên của MỌI bảng – hyperlink + nguồn

Cột đầu tiên (tên khách sạn hoặc loại phòng/gói) của **mọi bảng** (kể cả bảng ngày linh hoạt) **luôn là hyperlink** tới trang chi tiết trên trang có giá thấp nhất, và **luôn ghi nguồn trong ngoặc ngay sau link**, ví dụ:
- `[Family Bunk + vé cáp treo](https://www.ivivu.com/...) (iVIVU)`
- `[Superior King](https://www.booking.com/hotel/vn/....vi.html?...) (Booking)`
- `[Family Deluxe](https://www.agoda.com/vi-vn/accom/property?...) (Agoda)`

Link chỉ gồm ngày và số khách (không kèm session, label, sid hay token).

### Cột giá thực trả – bắt buộc ghi phép tính

Format đầy đủ:

`Giá phòng gốc + thuế/phí − coupon (chương trình hoặc thẻ nào) = giá cuối (checkout trang nào) − hoàn tiền (thẻ nào, %) = **giá thực trả**`

**Chỉ ghi số hạng nào thực sự có.** Tuyệt đối không ghi `+ 0`, `− 0` hay "không hoàn" trong phép tính vì gây khó hiểu:
- Không tách được thuế/phí (trang chỉ hiện giá đã gồm thuế) → bắt đầu từ giá cuối.
- Không có coupon → bỏ số hạng coupon.
- Không có hoàn tiền → giá cuối chính là giá thực trả (in đậm giá cuối).
- Nếu giá cuối bằng giá phòng gốc + thuế/phí mà không có coupon thì bỏ bước `=` trung gian, ghi thẳng `giá phòng gốc + thuế/phí = giá cuối (checkout …)`.

Ví dụ:
- Đủ các số hạng: `2.460.000 + 329.580 thuế/phí − 234.420 (mã Agoda Visa YRO, cần thẻ Visa) = 2.555.160 (checkout Agoda) − 7.665 (thẻ B 0,3%) = **2.547.495**`
- Không coupon: `4.500.000 + 603.000 thuế/phí = 5.103.000 (checkout Booking) − 1.000.000 (thẻ A 20% khách sạn, chạm trần 1 tr/kỳ) = **4.103.000**`
- Giá đã gồm thuế, không coupon: `2.808.000 (checkout Booking) − 561.600 (thẻ A 20% khách sạn) = **2.246.400**`
- Không hoàn tiền: `3.500.000 + 469.000 thuế/phí − 300.000 (voucher iVIVU) = **3.669.000** (checkout iVIVU)`

Quy tắc thêm:
- Ghi tên trang ngay trong ngoặc ở giá cuối (Booking/Agoda/iVIVU).
- Hoàn tiền chạm trần thì ghi rõ, ví dụ `− 1.000.000 (thẻ A 20% khách sạn, chạm trần 1 tr/kỳ)`.
- Phí giao dịch nước ngoài (nếu có) ghi thành số hạng cộng thêm sau giá cuối, ví dụ `+ 25.552 (phí nước ngoài ~1%)`.
- Giả định chưa chắc (MCC, khách sạn có nhận loại thẻ đó, trần còn lại, giá chưa đối chiếu ở trang checkout) ghi ở cột Ghi chú.

### Chế độ khu vực – 3 bảng (Đáng tiền nhất, Rẻ nhất, Chất lượng)

| Khách sạn | Phòng & điều kiện | Giá thực trả (N đêm) | Ghi chú |
|---|---|---|---|
| [Tên khách sạn](link trang chi tiết trên trang có giá thấp nhất) (Booking) | Loại phòng, m², **tiện ích ưu tiên của user (ví dụ bồn tắm ✓ / chỉ vòi sen / chưa rõ)**, ăn sáng, hạn hủy, trả trước/trả tại chỗ, điểm đánh giá | 2.460.000 + 329.580 thuế/phí = 2.789.580 (checkout Booking) − 557.916 (thẻ A 20% khách sạn) = **2.231.664** | Giá thực trả ở trang khác: Agoda 2.547.495, iVIVU 2.527.200; lý do xếp vào bảng (nêu ưu tiên nào được đáp ứng); giả định thẻ chưa chắc |

### Chế độ khách sạn chỉ định – 2 bảng (Rẻ nhất, Đáng tiền nhất) theo loại phòng/gói

**Bảng Rẻ nhất** – mỗi loại phòng một dòng, chỉ lựa chọn rẻ nhất của loại phòng đó:

| Loại phòng | Điều kiện | Giá thực trả (N đêm) | Ghi chú |
|---|---|---|---|
| [Tên loại phòng](link) (iVIVU) | m², giường, số khách tối đa, **tiện ích ưu tiên của user (ví dụ bồn tắm ✓ / chỉ vòi sen)**, ăn sáng, hạn hủy, trả trước/trả tại chỗ | 4.926.000 − 94.000 (điểm iVIVU) = 4.832.000 (checkout iVIVU) − 966.400 (thẻ A 20% khách sạn) = **3.865.600** | Giá thực trả trang khác: Booking …, Agoda … (hoặc "không bán"/"hết phòng"/"vượt sức chứa"); bản hủy miễn phí (+…); rủi ro thẻ |

**Bảng Đáng tiền nhất** – combo/gói có giá tốt hoặc tiện ích đi kèm tốt:

| Gói (loại phòng + dịch vụ) | Điều kiện & tiện ích đi kèm | Giá thực trả (N đêm) | Ghi chú |
|---|---|---|---|
| [Tên loại phòng + gói](link) (iVIVU) | Những gì gói gồm (vé, bữa tối, spa, đưa đón…), tiện ích ưu tiên của user, hạn hủy | 6.896.000 − 94.000 (điểm iVIVU) = 6.802.000 (checkout iVIVU) − 1.000.000 (thẻ A 20% khách sạn, chạm trần) = **5.802.000** | So với mua lẻ tương đương: rẻ hơn …k / đắt hơn …k nhưng được …; ưu tiên nào của user được đáp ứng |

Nếu có chi phí bắt buộc ngoài giá phòng, thêm cột **Tổng gồm chi phí bắt buộc** vào cả 2 bảng.

### Bảng ngày linh hoạt (cả 2 chế độ)

| Khách sạn / loại phòng | −1 ngày (dd/mm–dd/mm) | Ngày yêu cầu (dd/mm–dd/mm) | +1 ngày (dd/mm–dd/mm) | Ghi chú |
|---|---|---|---|---|
| [Tên khách sạn – loại phòng](link) (Booking) | 2.050.000 | **2.231.664** | 2.400.000 | Trang + thẻ giống Bước 3; rẻ hơn 181k nếu đi sớm 1 ngày |

Bảng ngày linh hoạt chỉ ghi giá thực trả (không cần phép tính đầy đủ), nhưng ghi trang + thẻ dùng để tính ở cột Ghi chú.

### Quy tắc chung
- **Link Booking trong báo cáo dùng `https://www.booking.com/...`, không dùng `m.booking.com`** để user duyệt dễ trên máy tính: thay `m.booking.com` bằng `www.booking.com`, giữ nguyên path và tham số ngày/số khách. Ví dụ: `https://www.booking.com/hotel/vn/<slug>.vi.html?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=<n>&group_children=<n>&age=<tuổi>&no_rooms=1`. Nếu giá thấp nhất là "Giá chỉ trên di động", ghi chú rằng giá đó chỉ thấy khi mở trên điện thoại/app.
- Ghi chú ngắn: giá các trang còn lại, nhãn giá di động, rủi ro (MCC, trần thẻ còn lại, ưu đãi chưa xác nhận).
- Sau các bảng: 1–2 câu chốt lựa chọn (nêu lựa chọn đó đáp ứng ưu tiên nào của user), nhắc hạn hủy miễn phí và yêu cầu cũi nếu có em bé.

## Dọn dẹp

Đóng mọi tab đã mở trước khi trả lời. Không giữ lại trang nào đang ở bước đặt phòng.