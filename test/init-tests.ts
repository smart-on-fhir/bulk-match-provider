import path     from "path"
import fs       from "fs/promises"
import { wait } from "../src/lib"


async function deleteSubfolders(directory: string) {
    try {
        const files = await fs.readdir(directory);
  
        for (const file of files) {
            const filePath = path.join(directory, file);
            const stat = await fs.lstat(filePath);
    
            if (stat.isDirectory()) {
                await fs.rm(filePath, { recursive: true });
            }
        }
    } catch (err) {
        console.error('Error deleting subfolders:', err);
    }
}

after(async () => {
    await wait(200)
    await deleteSubfolders(path.join(__dirname, "../test-jobs"))
})