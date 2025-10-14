
import asyncio
import aiohttp
import pandas as pd
import re

async def fetch_efiles(session, book_id):
    """Fetches all efile URLs for a given book ID."""
    if not book_id:
        return ""

    efiles_url = f"https://publish.budaedu.org/dharma/public/api/books/{book_id}/efiles"
    try:
        async with session.get(efiles_url, ssl=False, timeout=30) as response:
            if response.status == 200:
                data = await response.json()
                pdf_urls = [
                    efile.get("url")
                    for efile in data.get("data", [])
                    if efile.get("url") and re.search(r'\.pdf$', efile.get("url"), re.IGNORECASE)
                ]
                return "; ".join(sorted(pdf_urls)) if pdf_urls else ""
            else:
                return ""
    except Exception as e:
        print(f"  - 獲取 book ID {book_id} 的 efile 時發生錯誤: {e}")
        return ""

async def fetch_page(session, page):
    """Fetches a single page of CHINESE book data from the API with retry logic."""
    # Corrected URL to filter for Chinese books directly in the path
    url = f"https://publish.budaedu.org/dharma/public/api/books/chinese"
    params = {
        "per_page": 50,
        "page": page,
        "order": "code,asc"
    }

    for attempt in range(3):
        print(f"正在獲取第 {page} 頁的中文書籍列表... (嘗試 {attempt + 1}/3)")
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
    """Main function to crawl all CHINESE book data and save to Excel."""
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

            tasks = [fetch_efiles(session, book.get("id")) for book in books_on_page]

            print(f"正在為第 {current_page} 頁的 {len(books_on_page)} 本書並行獲取 PDF 連結...")
            efile_results = await asyncio.gather(*tasks)

            for book, pdf_links in zip(books_on_page, efile_results):
                all_books.append({
                    "編號": book.get("code"),
                    "書名": book.get("chinese_name"),
                    "作者": book.get("chinese_author"),
                    "簡介": book.get("chinese_intro"),
                    "上傳時間": book.get("created_at"),
                    "PDF下載連結": pdf_links
                })

            print(f"成功處理 {len(books_on_page)} 本書。目前總數: {len(all_books)}")
            current_page += 1
            await asyncio.sleep(1)

    if all_books:
        print("\n正在將資料寫入 Excel 檔案...")
        df = pd.DataFrame(all_books)
        df.to_excel("budaedu.xlsx", index=False, engine='openpyxl')
        print(f"成功！共 {len(all_books)} 筆資料已儲存至 budaedu.xlsx")
    else:
        print("未獲取到任何書籍資料。")

if __name__ == "__main__":
    asyncio.run(main())
