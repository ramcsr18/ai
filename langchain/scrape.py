import requests
from bs4 import BeautifulSoup

# Step 1: Specify the URL
url = "https://wikipedia.com"

headers = {"User-Agent": "AppleProject/1.0 (github link and email)"}

# Step 2: Send a GET request to the website
response = requests.get(url, headers=headers)

# Step 3: Parse the website content
soup = BeautifulSoup(response.text, "html.parser")

# Step 4: Extract all text from the page
text_data = soup.get_text()

# Step 5: Print the first 500 characters of the text
print(text_data[:500])
