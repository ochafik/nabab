export function getUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.onreadystatechange = (e: ProgressEvent) => {
      if (req.readyState == XMLHttpRequest.DONE) {
        if (req.status == 200) {
          resolve(req.responseText);
        } else {
          reject(req.responseText);
        }
      }
    };
    // req.onload = () => resolve(req.responseText);
    // req.onerror = (e) => reject(e);
    req.open('GET', url, true);
    req.send(null);
  });
}
