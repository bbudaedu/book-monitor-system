
import asyncio
import aiohttp
import pandas as pd

async def fetch_page(session, page):
    """Fetches a single page of book data from the API with retry logic."""
    url = f"https://publish.budaedu.org/dharma/public/api/books"
    params = {
        "per_page": 100,  # Fetch 100 items per page for even better efficiency
        "page": page,
        "order": "code,asc"
    }

    for attempt in range(3):
        print(f"正在獲取第 {page} 頁的書籍列表... (嘗試 {attempt + 1}/3)")
        try:
            async with session.get(url, params=params, ssl=False, timeout=60) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("data", [])
                else:
                    print(f"錯誤：第 {page} 頁請求失敗，狀態碼：{response.status}。")
        except Exception as e:
            print(f"請求第 {page} 頁時發生錯誤: {e}")

        if attempt < 2:
            print("5 秒後重試...")
            await asyncio.sleep(5)

    print(f"重試 3 次後，第 {page} 頁仍然失敗。")
    return None

async def main():
    """Main function to crawl all book data and save to Excel."""
    all_books = []
    current_page = 1

    async with aiohttp.ClientSession() as session:
        while True:
            books_on_page = await fetch_page(session, current_page)

            if books_on_page is None:
                print("由於連續請求失敗，爬取中止。")
                break

            if not books_on_page:
                print("找不到更多書籍資料，爬取結束。")
                break

            for book in books_on_page:
                book_code = book.get("code")
                # Construct the PDF URL directly based on the discovered pattern
                pdf_url = f"https://www2.budaedu.org/dharma-data/book-efile/{book_code}-01-001.PDF" if book_code else ""

                all_books.append({
                    "編號": book_code,
                    "書名": book.get("chinese_name"),
                    "作者": book.get("chinese_author"),
                    "簡介": book.get("chinese_intro"),
                    "上傳時間": book.get("created_at"),
                    "PDF下載連結": pdf_url
                })

            print(f"成功處理 {len(books_on_page)} 本書。目前總數: {len(all_books)}")
            current_page += 1
            await asyncio.sleep(0.2) # A shorter sleep is fine as we are making fewer requests

    if all_books:
        print("\n正在將資料寫入 Excel 檔案...")
        df = pd.DataFrame(all_books)
        df.to_excel("budaedu.xlsx", index=False, engine='openpyxl')
        print(f"成功！共 {len(all_books)} 筆資料已儲存至 budaedu.xlsx")
    else:
        print("未獲取到任何書籍資料。")

if __name__ == "__main__":
    asyncio.run(main())
