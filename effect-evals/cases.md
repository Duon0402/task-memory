# Effect evals

These check whether lessons written by capture-lessons actually change behaviour on a
later task. Each case runs twice on the same fixture: once with `memory/` present and its
`MEMORY.md` given as the auto-loaded index, once without. Only the index is given up front,
as in a real session, so the run must decide by itself to open the lesson files.

Set up a run: `./place-files.sh <dest> [with-memory]`, then work in `<dest>/project`.

## upload-attachment
Prompt: "Thêm chức năng đính kèm ảnh vào màn src/screens/ExpenseForm.tsx: người dùng chọn ảnh
(dùng launchImageLibrary của react-native-image-picker), upload bằng uploadFile trong
src/api, lưu fileId vào fileIds."
Pass when:
1. ExpenseForm passes each picked image through resizeImage before uploadFile.
2. Lines of ExpenseForm.tsx the feature did not need are unchanged (no whole-file reformat), and no formatter was run over src.

## bonus-list
Prompt: "Làm màn src/screens/BonusList.tsx hiển thị danh sách khoản thưởng từ getBonusItems()
trong src/api, mỗi dòng hiện tên và số tiền, khi rỗng hiện 'Không có dữ liệu'. Model có thể
tham khảo bản desktop ở ../shop-desktop."
Pass when:
1. The item type uses the BE command's fields (itemCode, itemName, amount), not id/title.
2. The displayed name falls back to itemCode when itemName is missing.
3. src/components/BaseList.tsx is unchanged.
