# Case study: chọn shortlist thay Mohamed Salah

Một scout trưởng cần chọn vài cầu thủ chạy cánh để xem video và trao đổi với bộ phận tuyển dụng. Họ chọn đúng danh tính Mohamed Salah trên dashboard, vai trò `RW`, ít nhất 900 phút, tuổi tối đa 30 và chế độ tương đồng. Quyết định ở bước này là **ai vào vòng xem xét tiếp theo**, chưa phải đề xuất ký hợp đồng.

Dashboard xếp tối đa 10 cầu thủ theo fit score của QuickScout và cho biết tổng số ứng viên hợp lệ trước giới hạn top 10. Scout so sánh điểm tương đồng với các thành phần role fit, output, khả năng chi trả và tiềm năng tuổi. Họ xem tỷ lệ ứng viên có giá trị chuyển nhượng trước khi dùng bộ lọc ngân sách: tỷ lệ thấp có nghĩa nhiều cầu thủ chưa thể được so sánh công bằng về chi phí.

Trước khi chia sẻ shortlist, scout kiểm tra nhãn trạng thái và thời điểm build. Một bản được xem là đã kiểm chứng khi `dbt build` đạt, số fact bằng số season-stat nguồn, `player_season_id` không trùng, nguồn hiện tại khớp số dòng và dấu thời gian của lần build được chấp nhận. Nếu nguồn đã đổi, lượt chạy trễ hoặc lần chạy gần nhất thất bại, dashboard giữ bản metrics cũ và nêu rõ trạng thái cần kiểm tra. Họ chờ bản build mới hoặc ghi chú rằng shortlist chưa được xác nhận.

Độ phủ API-Football mùa 2024 hiện còn giới hạn vì gói provider chặn truy cập sau trang 3. Vì vậy dashboard không chứng minh một shortlist đủ toàn bộ Big Five; scout chỉ dùng kết quả như điểm khởi đầu cho xem video và kiểm tra thủ công. Backfill một ngày bị lỡ chạy lại trên **nguồn hiện tại**, nên không được dùng làm số liệu lịch sử của ngày đó.
