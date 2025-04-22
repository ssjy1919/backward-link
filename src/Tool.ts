import {
	BlockCache,
	CachedMetadata,
	Editor,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import BidirectionalblockLinkPlugin from "./main";
import { DateTime } from "luxon";
// 获取当前行所属的块（block）的 ID。
function getBlockLinkID(
	activeFile: TFile,
	currentLine: number,
	plugin: BidirectionalblockLinkPlugin
) {
	// 获取当前活动文件的元数据缓存
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	// 确保缓存中存在 blocks 对象，避免后续操作出现错误
	if (cache?.blocks) {
		// 遍历缓存中的所有块，查找包含当前行的块
		const blocks = Object.values(cache.blocks).find((block) => {
			return (
				block.position.start.line <= currentLine &&
				block.position.end.line >= currentLine
			);
		});
		return blocks?.id;
	}
}
function getDate(plugin: BidirectionalblockLinkPlugin): string {
	const format = plugin.settings.blockID;
	const now = DateTime.now();
	return now.toFormat(format);
}

//嵌入反向链接
function InsertReverseLink(
	activeFile: TFile,
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor
) {
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	const Cursor = editor.getCursor();
	// 当前光标指向的链接
	const link = cache?.links?.find((link) => {
		if (
			link.position.end.line === Cursor?.line &&
			link.position.end.col >= Cursor.ch &&
			link.position.start.col <= Cursor.ch
		) {
			return link;
		}
	});
	if (!link) {
		new Notice("没找到光标处的链接");
		return;
	}
	// TFile
	const linkFile = plugin.app.metadataCache.getFirstLinkpathDest(
		link.link.split("#")[0],
		activeFile.path
	);

	if (!linkFile){
		new Notice("目标块 ID 失效");
		return;
	}
	const linkBlocks = link.link.split("^");
	let linkBlock = "";
	if (linkBlocks.length > 1) {
		linkBlock = link.link.split("^")[1].split("|")[0];
	} else {
		new Notice("不是块链接");
		return;
	}
	const linkFileCache = plugin.app.metadataCache.getFileCache(linkFile);
	if (linkFileCache?.blocks) {
		// 遍历链接文件缓存中的所有块，查找包含当前行链接的块
		const blocks = Object.values(linkFileCache.blocks).find((block) => {
			return block.id === linkBlock;
		});
		if (blocks) return { blocks, linkFile };
	}
}
/** 插入文本 */
async function insertTextAtPosition(
	plugin: BidirectionalblockLinkPlugin,
	blocks: BlockCache,
	linkFile: TFile,
	blockLinkID: string
) {
	try {
		// 获取目标文件
		const targetFile = plugin.app.vault.getFileByPath(linkFile.path);
		if (!targetFile) {
			throw new Error("文件不存在");
		}
		// 读取文件内容
		const fileContent = await plugin.app.vault.read(targetFile);
		const lines = fileContent.split("\n");
		// 获取目标行的内容
		const targetLine = lines[blocks.position.end.line];
		// 在指定列位置插入文本
		const insertPosition = blocks.position.end.col - blocks.id.length - 2; // 计算插入位置为块ID之前
		const newLine =
			targetLine.slice(0, insertPosition) +
			blockLinkID +
			targetLine.slice(insertPosition);
		// 更新行内容
		lines[blocks.position.end.line] = newLine;
		// 将更新后的内容写回文件
		const newContent = lines.join("\n");
		await plugin.app.vault.modify(targetFile, newContent);
		new Notice(
			`在链接文件第${
				blocks.position.end.line + 1
			}行成功插入链接：${blockLinkID}`,
			10000
		);
		return true;
	} catch (error) {
		console.error("插入文本失败:", error);
		new Notice(`插入文本失败${error}`, 10000);
		return false;
	}
}
// 嵌入块链接
function blockLink(
	activeFile: TFile,
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor
) {
    const cursor = editor.getCursor();
    if (!cursor) {
        new Notice("请先在编辑器中点击定位光标");
        return;
    }
	const currentLine = cursor.line;
	let blockLinkID = getBlockLinkID(activeFile, currentLine, plugin);
	if (!blockLinkID) {
		blockLinkID = getDate(plugin);
	}
	const currentLineContent = editor.getLine(currentLine);
	// 获取当前行的行尾位置
	const lineEnd = {
		line: currentLine,
		ch: currentLineContent.length,
	};

	return { blockLinkID, lineEnd };
}

/** 验证块ID是否重复 */
function checkBlockIDDuplicate(cache: CachedMetadata, blockLinkID: string) {
	if (cache.blocks && Object.keys(cache.blocks).includes(blockLinkID)) {
		blockLinkID += "x";
		blockLinkID = checkBlockIDDuplicate(cache, blockLinkID);
	}
	return blockLinkID;
}
//反向插入链接
export async function reverseinsertionlink(
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor,
	displayText: string
) {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice("出错了，没找到当前文件");
		return;
	}
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	if (!cache) {
		new Notice("出错了，没找到当前文件元数据缓存");
		return;
	}
	// 当前文件光标位置的块ID
	const block = blockLink(activeFile, plugin, editor);
	if (!block) {
		return;
	}
	let { blockLinkID, lineEnd } = block;
	blockLinkID = checkBlockIDDuplicate(cache, blockLinkID);
	// 光标所指向的链接，在对方文件里的块ID
	const reverseLinkInfo = InsertReverseLink(activeFile, plugin, editor);
	if (!reverseLinkInfo) {
		return;
	}
	const { blocks, linkFile } = reverseLinkInfo;
	if (displayText == "basename") {
		displayText = `[[${activeFile.path}#^${blockLinkID}|${activeFile.basename}]]`;
	} else if (displayText == "path") {
		displayText = `[[${activeFile.path}#^${blockLinkID}]]`;
	} else if (displayText == "foot") {
		displayText = `^[[[${activeFile.path}#^${blockLinkID}]]]`;
	} else if (displayText == "custom") {
		displayText = `[[${activeFile.path}#^${blockLinkID}|${plugin.settings.displayText}]]`;
	}
	const insertText = await insertTextAtPosition(
		plugin,
		blocks,
		linkFile,
		displayText
	);
	if (insertText) editor.replaceRange(` ^${blockLinkID}`, lineEnd, lineEnd);
}
