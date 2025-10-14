
import asyncio
import aiohttp
import pandas as pd

async def fetch_page(session, page):
    """Fetches a single page of book data from the API with retry logic."""
    url = f"https://publish.budaedu.org/dharma/public/api/books"
    params = {
        "per_page": 50,
        "page": page,
        "order": "code,asc"
    }

    # Retry logic: Attempt up to 3 times
    for attempt in range(3):
        print(f"正在獲取第 {page} 頁的資料... (嘗試 {attempt + 1}/3)")
        try:
            async with session.get(url, params=params, ssl=False, timeout=30) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("data", [])
                else:
                    print(f"錯誤：第 {page} 頁請求失敗，狀態碼：{response.status}。")
        except Exception as e:
            print(f"請求第 {page} 頁時發生錯誤: {e}")

        # If not the last attempt, wait before retrying
        if attempt < 2:
            print("2 秒後重試...")
            await asyncio.sleep(2)

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
                all_books.append({
                    "book_name": book.get("chinese_name"),
                    "author": book.get("chinese_author")
                })

            print(f"成功獲取 {len(books_on_page)} 本書。目前總數: {len(all_books)}")
            current_page += 1
            await asyncio.sleep(0.5)

    if all_books:
        print("\n正在將資料寫入 Excel 檔案...")
        df = pd.DataFrame(all_books)
        df.to_excel("budaedu.xlsx", index=False, engine='openpyxl')
        print(f"成功！共 {len(all_books)} 筆資料已儲存至 budaedu.xlsx")
    else:
        print("未獲取到任何書籍資料。")

if __name__ == "__main__":
    asyncio.run(main())
