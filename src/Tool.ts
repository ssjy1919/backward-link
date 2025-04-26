import {
	BlockCache,
	CachedMetadata,
	Editor,
	LinkCache,
	Notice,
	TFile,
} from "obsidian";
import BidirectionalblockLinkPlugin from "./main";
import { DateTime } from "luxon";

interface VaultConfig {
	alwaysUpdateLinks: Boolean;
	newLinkFormat: "relative" | "absolute" | "shortest";
	showInlineTitle: Boolean;
	showUnsupportedFiles: Boolean;
	useMarkdownLinks: Boolean;
}
/** 获取当前行所属的块（block）的 ID。 */
function getBlockLinkID(cache: CachedMetadata, currentLine: number) {
	// 确保缓存中存在 blocks 对象，避免后续操作出现错误
	if (cache.blocks) {
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

//查找光标指向的链接所对应的块
function getLinkBlock(
	activeFile: TFile,
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor
) {
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	const Cursor = editor.getCursor();
	// 当前光标指向的链接
	const link = cache?.links?.find((link) => {
		if (
			link.position.end.line === Cursor.line &&
			link.position.end.col >= Cursor.ch &&
			link.position.start.col < Cursor.ch
		) {
			return link;
		}
	});
	if (!link) {
		new Notice("光标不在链接文本中");
		return;
	}
	// TFile
	const linkFile = plugin.app.metadataCache.getFirstLinkpathDest(
		link.link.split("#")[0],
		activeFile.path
	);

	if (!linkFile) {
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
		// 遍历链接文件缓存中的所有块，查找当前光标链接对应的块
		const linkBlocks = Object.values(linkFileCache.blocks).find((block) => {
			return block.id === linkBlock;
		});
		if (linkBlocks) return { linkBlocks, linkFile, link };
	}
}
/** 插入反向链接 */
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
		console.log(blocks);
		// 在指定列位置插入文本
		const insertPosition = targetLine.includes(` ^${blocks.id}`)
			? blocks.position.end.col - blocks.id.length - 2 // 计算插入位置为块ID之前
			: blocks.position.end.col; // 块ID不在行尾，直接在行尾插入反向链接
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
			`在 ${linkFile.basename} 第${
				blocks.position.end.line + 1
			}行成功插入反向链接：${blockLinkID}`,
			10000
		);
		return true;
	} catch (error) {
		console.error("插入反向链接失败:", error);
		new Notice(`插入反向链接失败${error}`, 10000);
		return false;
	}
}

/** 保证证生成的新 ID 的不重复*/
function checkBlockIDDuplicate(cache: CachedMetadata, blockLinkID: string) {
	if (cache.blocks && Object.keys(cache.blocks).includes(blockLinkID)) {
		blockLinkID += "x";
		blockLinkID = checkBlockIDDuplicate(cache, blockLinkID);
	}
	return blockLinkID;
}
//插入反向链接
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
	/** 光标所指向的链接，在对方文件里的块ID */
	const reverseLinkInfo = getLinkBlock(activeFile, plugin, editor);
	if (!reverseLinkInfo) {
		return;
	}

	let blockLinkID = getBlockLinkID(cache, editor.getCursor().line);
	if (!blockLinkID) {
		blockLinkID = getDate(plugin);
		blockLinkID = checkBlockIDDuplicate(cache, blockLinkID);
	}
	const { linkBlocks, linkFile, link } = reverseLinkInfo;
	if (plugin.settings.renameLink) {
		const replaceRangeText = `|${link.link.split("#")[0]}`;
		if (!link.original.includes("|")) {
			renameBlockLink(replaceRangeText, editor, link);
		}
	}
	displayText = getDisplayText(plugin, activeFile, blockLinkID, displayText);
	const insertText = await insertTextAtPosition(
		plugin,
		linkBlocks,
		linkFile,
		displayText
	);
	if (!getBlockLinkID(cache, editor.getCursor().line) && insertText)
		// 修改了当前行的链接之后，需要重新获取当前行的长度
		insertBlockID(` ^${blockLinkID}`, editor);
}
/** 重命名块链接 */
function renameBlockLink(
	replaceRangeText: string,
	editor: Editor,
	link: LinkCache
) {
	editor.replaceRange(
		replaceRangeText,
		{ line: link.position.end.line, ch: link.position.end.col - 2 },
		{ line: link.position.end.line, ch: link.position.end.col - 2 }
	);
	editor.setCursor({
		line: link.position.end.line,
		ch: link.position.end.col + replaceRangeText.length,
	});
}
/** 根据设置生成块链接文本 */
function getDisplayText(
	plugin: BidirectionalblockLinkPlugin,
	activeFile: TFile,
	blockLinkID: string,
	displayText: string
) {
	//@ts-ignore
	const newLinkFormat = (plugin.app.vault.config as VaultConfig)
		.newLinkFormat;
	const files = plugin.app.vault
		.getFiles()
		.filter((file: TFile) => file.name === activeFile.name);
	if (displayText == "basename") {
		displayText = `[[${
			files.length === 1 && newLinkFormat === "shortest"
				? activeFile.basename
				: activeFile.path
		}#^${blockLinkID}|${activeFile.basename}]]`;
	} else if (displayText == "path") {
		displayText = `[[${
			files.length === 1 && newLinkFormat === "shortest"
				? activeFile.basename
				: activeFile.path
		}#^${blockLinkID}]]`;
	} else if (displayText == "foot") {
		displayText = `^[[[${
			files.length === 1 && newLinkFormat === "shortest"
				? activeFile.basename
				: activeFile.path
		}#^${blockLinkID}]]]`;
	} else if (displayText == "custom") {
		displayText = `[[${
			files.length === 1 && newLinkFormat === "shortest"
				? activeFile.basename
				: activeFile.path
		}#^${blockLinkID}|${plugin.settings.displayText}]]`;
	}
	return displayText;
}

/** 记录当前块的块链接 */
export function markblockLink(
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor
) {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) return;
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	if (!cache) return;
	let blockLinkID = getBlockLinkID(cache, editor.getCursor().line);
	if (!blockLinkID) {
		blockLinkID = getDate(plugin);
		blockLinkID = checkBlockIDDuplicate(cache, blockLinkID);
	}
	const displayText = getDisplayText(
		plugin,
		activeFile,
		blockLinkID,
		"basename"
	);
	if (plugin.settings.renameLink) {
		/** 光标所指向的链接，在对方文件里的块ID */
		const reverseLinkInfo = getLinkBlock(activeFile, plugin, editor);
		if (reverseLinkInfo) {
			const { link } = reverseLinkInfo;
			const replaceRangeText = `|${link.link.split("#")[0]}`;
			if (!link.original.includes("|")) {
				renameBlockLink(replaceRangeText, editor, link);
			}
		}
	}
	if (!getBlockLinkID(cache, editor.getCursor().line))
		// 修改了当前行的链接之后，需要重新获取当前行的长度
		insertBlockID(` ^${blockLinkID}`, editor);
	plugin.settings.blockLinkMark = displayText;
	plugin.saveSettings();
	new Notice(`已记录当前块链接：${displayText}`);
}
/** 在当前行尾插入块ID */
function insertBlockID(blockLinkID: string, editor: Editor) {
	editor.replaceRange(
		` ^${blockLinkID}`,
		{
			line: editor.getCursor().line,
			ch: editor.getLine(editor.getCursor().line).length,
		},
		{
			line: editor.getCursor().line,
			ch: editor.getLine(editor.getCursor().line).length,
		}
	);
}

/** 在光标处插入记录中的块链接 */
export async function insertblockLink(
	plugin: BidirectionalblockLinkPlugin,
	editor: Editor
) {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!activeFile) return;
	const cache = plugin.app.metadataCache.getFileCache(activeFile);
	if (!cache) return;
	const displayText = plugin.settings.blockLinkMark;
	if (displayText) {
		editor.replaceRange(
			displayText,
			editor.getCursor(),
			editor.getCursor()
		);
		editor.setCursor({
			line: editor.getCursor().line,
			ch: editor.getCursor().ch + displayText.length,
		});
	}
}
