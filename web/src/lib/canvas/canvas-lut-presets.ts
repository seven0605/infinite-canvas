export type CanvasLutCollection = "guofeng" | "cinema";

export type CanvasLutPreset = {
    id: string;
    collection: CanvasLutCollection;
    nameZh: string;
    nameEn: string;
    promptZh: string;
};

export type CanvasLutPreviewPalette = {
    sky: string;
    haze: string;
    ground: string;
    shadow: string;
    accent: string;
    filter: string;
    grain: boolean;
};

export const CANVAS_LUT_PRESETS: readonly CanvasLutPreset[] = [
    { id: "guofeng-2", collection: "guofeng", nameZh: "大秦赋（秦代青铜质感）", nameEn: "Qin Dynasty Bronze", promptZh: "秦代青铜色调，冷青灰色主调，低饱和度，高对比度，深黑阴影，金属质感强烈，历史厚重感，战争史诗氛围，古朴大气" },
    { id: "guofeng-14", collection: "guofeng", nameZh: "楚汉传奇（汉代土黄质感）", nameEn: "Han Dynasty Earthy Yellow", promptZh: "汉代土黄色调，暖棕褐色主调，低饱和度，高对比度，粗粝质感，战争场面尘土飞扬，自然光为主，古朴雄浑的大汉气象" },
    { id: "guofeng-15", collection: "guofeng", nameZh: "汉武大帝（汉代宫廷质感）", nameEn: "Han Dynasty Court", promptZh: "汉代宫廷色调，朱红与玄黑对比，低饱和度，高对比度，木质纹理清晰，烛光暖光，庄严肃穆，大汉盛世的威严感" },
    { id: "guofeng-16", collection: "guofeng", nameZh: "星汉灿烂（东汉雅致质感）", nameEn: "Eastern Han Elegant", promptZh: "东汉雅致色调，低饱和度，茶褐与豆绿为主，柔和光影，丝绸质感温润，庭院深深的氛围感，端庄大气的世家风范" },
    { id: "guofeng-17", collection: "guofeng", nameZh: "周生如故（魏晋风骨）", nameEn: "The Longest Promise", promptZh: "魏晋风骨美学，青灰色主调，低饱和度，高对比度，留白意境，柔和光影，烟雨江南质感，清冷孤寂的氛围感，水墨画风格" },
    { id: "guofeng-28", collection: "guofeng", nameZh: "琅琊榜（水墨山水）", nameEn: "Nirvana in Fire", promptZh: "中国水墨山水风格，低饱和度，青灰色主调，高对比度，留白意境，柔和光影，仙气飘飘，画面干净通透，家国天下的大气氛围" },
    { id: "guofeng-39", collection: "guofeng", nameZh: "凤囚凰（魏晋飘逸）", nameEn: "Untouchable Lovers", promptZh: "魏晋飘逸美学，白色与淡青色主调，低饱和度，柔和光影，宽袍大袖质感，仙气缭绕，清冷孤傲的氛围感，竹林七贤意境" },
    { id: "guofeng-40", collection: "guofeng", nameZh: "长安十二时辰（古画绢帛）", nameEn: "The Longest Day in Chang'an", promptZh: "唐代古画绢帛质感，整体偏暖黄，高对比度，浓郁厚重，色彩层次丰富，市井烟火气，夜晚灯笼暖光，盛世繁华与阴暗对比，电影级质感" },
    { id: "guofeng-51", collection: "guofeng", nameZh: "妖猫传（盛唐华丽）", nameEn: "Legend of the Demon Cat", promptZh: "盛唐华丽美学，高饱和度传统色彩，朱红、明黄、翠绿对比强烈，金色点缀，柔和光晕，梦幻浪漫，古画质感，大气磅礴的盛世氛围" },
    { id: "guofeng-52", collection: "guofeng", nameZh: "国色芳华（唐代复原）", nameEn: "National Beauty", promptZh: "唐代古画复原配色，色彩明艳但不刺眼，齐胸襦裙质感，暖色调为主，金色装饰光泽自然，妆容色彩还原，华丽而不俗气" },
    { id: "guofeng-53", collection: "guofeng", nameZh: "知否知否（宋代工笔画）", nameEn: "The Story of Ming Lan", promptZh: "宋代工笔画质感，淡雅柔和低饱和度，灰度较高，白天偏冷调，夜晚烛光昏黄，肤色自然，无过度磨皮，保留木质纹理，温润如玉的东方美学" },
    { id: "guofeng-54", collection: "guofeng", nameZh: "梦华录（宋代雅致）", nameEn: "A Dream of Splendor", promptZh: "宋代极简美学，天青色主调，低饱和度，柔和光影，江南水乡质感，肤色通透自然，轻微古画绢帛泛黄效果，清新淡雅，留白意境" },
    { id: "guofeng-65", collection: "guofeng", nameZh: "清平乐（宋瓷质感）", nameEn: "Serenade of Peaceful Joy", promptZh: "宋瓷釉面质感，低饱和度传统中国色，茶褐、殷红、鸭卵青为主，柔和均匀光照，画面细腻温润，低调奢华，宋代宫廷雅致氛围" },
    { id: "guofeng-66", collection: "guofeng", nameZh: "大明王朝 1566（历史厚重）", nameEn: "Ming Dynasty 1566", promptZh: "历史正剧质感，低饱和度，偏冷青色调，高对比度，暗部浓重，自然光与烛光为主，阴影层次丰富，庄严肃穆，权谋斗争的压抑氛围" },
    { id: "guofeng-67", collection: "guofeng", nameZh: "显微镜下的大明（徽派水墨）", nameEn: "Under the Microscope", promptZh: "徽派建筑水墨质感，粉墙黛瓦，低饱和度，青灰色主调，柔和自然光，江南水乡质感，画面干净通透，写实风格，明代市井生活气息" },
    { id: "guofeng-68", collection: "guofeng", nameZh: "九重紫（明代雅致）", nameEn: "Ninefold Purple", promptZh: "明代中后期美学，暗纹丝绸质感，低饱和度正色，朱红、明黄、鸭青为主，光泽温润，低调奢华，暖色调室内，冷色调室外，端庄大气" },
    { id: "guofeng-69", collection: "guofeng", nameZh: "延禧攻略（莫兰迪色）", nameEn: "Story of Yanxi Palace", promptZh: "莫兰迪高级灰调色，低饱和度，柔和对比，传统中国色，绛红、石青、明黄为主，画面质感厚重，复古优雅，清代宫廷氛围" },
    { id: "guofeng-80", collection: "guofeng", nameZh: "如懿传（油画质感）", nameEn: "Ruyi's Royal Love in the Palace", promptZh: "古典油画质感，浓郁厚重，高对比度，暖色调为主，金色点缀，光影层次丰富，肤色自然，华丽大气的清代宫廷氛围" },
    { id: "guofeng-81", collection: "guofeng", nameZh: "甄嬛传（古典雅致）", nameEn: "Empresses in the Palace", promptZh: "清代古典雅致色调，低饱和度，暖色调为主，柔和光影，丝绸质感细腻，宫廷礼仪氛围，端庄大气，东方女性的温婉之美" },
    { id: "guofeng-82", collection: "guofeng", nameZh: "苍兰诀・水云天", nameEn: "Love Between Fairy and Devil - Shuiyuntian", promptZh: "仙界神圣质感，明亮柔和，白色与淡蓝色主调，低对比度，柔和光晕，仙气缭绕，通透纯净，神圣庄严的氛围" },
    { id: "guofeng-93", collection: "guofeng", nameZh: "苍兰诀・苍盐海", nameEn: "Love Between Fairy and Devil - Cangyanhai", promptZh: "魔界暗黑质感，冷色调为主，黑色与金色对比强烈，高对比度，硬朗光影，压抑沉重，神秘霸气的氛围" },
    { id: "guofeng-94", collection: "guofeng", nameZh: "苍兰诀・云梦泽", nameEn: "Love Between Fairy and Devil - Yunmengze", promptZh: "人间烟火质感，暖黄色调，低饱和度，柔和自然光，古画绢帛泛黄效果，市井生活气息，温暖治愈的氛围" },
    { id: "guofeng-95", collection: "guofeng", nameZh: "沉香如屑（仙侠唯美）", nameEn: "Immortal Samsara", promptZh: "仙侠唯美风格，淡紫色与白色主调，低饱和度，柔和光晕，仙气缭绕，梦幻浪漫，画面干净通透，东方神话意境" },
    { id: "cinema-2", collection: "cinema", nameZh: "布达佩斯大饭店", nameEn: "Grand Budapest Hotel", promptZh: "粉色与紫色主调，明亮柔和，童话般色彩，精致对称，轻微光晕，低对比度高光" },
    { id: "cinema-13", collection: "cinema", nameZh: "奥本海默", nameEn: "Oppenheimer", promptZh: "三种胶片混合质感，暖棕黄色调，高对比度，深黑阴影，轻微颗粒感，纪实风格，冷蓝色点缀" },
    { id: "cinema-24", collection: "cinema", nameZh: "繁花", nameEn: "Blossoms Shanghai", promptZh: "金色主调，冷蓝色对比，90 年代复古质感，柔和光晕，高对比度，暖肤色，繁华迷离氛围" },
    { id: "cinema-25", collection: "cinema", nameZh: "七宗罪", nameEn: "Se7en", promptZh: "银漂工艺，高对比度，低饱和度，青灰色调，浓重暗部，湿冷雨雾质感，强烈阴影" },
    { id: "cinema-26", collection: "cinema", nameZh: "花样年华", nameEn: "In the Mood for Love", promptZh: "暖红色与墨绿色对比，低饱和度，柔和光影，复古旗袍质感，轻微颗粒感，忧郁浪漫氛围" },
    { id: "cinema-27", collection: "cinema", nameZh: "逃狱三王", nameEn: "O Brother, Where Art Thou?", promptZh: "全片棕褐色调，所有绿色变为枯黄，干燥炎热质感，高对比度，复古胶片颗粒" },
    { id: "cinema-28", collection: "cinema", nameZh: "绝命毒师通用", nameEn: "Breaking Bad Universal", promptZh: "新墨西哥沙漠暖黄色调，冷蓝色对比，高对比度，随着剧情色调逐渐变暗，轻微颗粒感" },
    { id: "cinema-39", collection: "cinema", nameZh: "绝命毒师墨西哥", nameEn: "Breaking Bad Mexico", promptZh: "高饱和度暖黄色调，橙色天空，干燥沙尘质感，高对比度，强烈阳光阴影" },
    { id: "cinema-40", collection: "cinema", nameZh: "浴血黑帮", nameEn: "Peaky Blinders", promptZh: "黑白灰为主低饱和度，少量金色红色点缀，冷色调，雾气弥漫，工业时代质感，深黑阴影" },
    { id: "cinema-51", collection: "cinema", nameZh: "狂飙粉红时期", nameEn: "Kuangbiao Pink Period", promptZh: "光怪陆离暖色调，高饱和度，粉色与黄色主调，人物发迹阶段，明亮欢快氛围" },
    { id: "cinema-52", collection: "cinema", nameZh: "知否知否", nameEn: "Zhi Fou", promptZh: "宋代古风，淡雅柔和低饱和度，灰度较高，白天偏冷调，夜晚烛光昏黄，工笔画质感" },
    { id: "cinema-53", collection: "cinema", nameZh: "沙丘阿拉基斯", nameEn: "Dune Arrakis", promptZh: "暖棕黄色调，无蓝色天空，胶片跳漂效果，低饱和度，高对比度，沙尘质感，宏大史诗感" },
    { id: "cinema-64", collection: "cinema", nameZh: "银翼杀手 2049 拉斯维加斯", nameEn: "Blade Runner 2049 Vegas", promptZh: "标志性暖橙色雾霾，沙尘漫天，高对比度，无蓝色，荒凉末世感，柔和光晕" },
    { id: "cinema-75", collection: "cinema", nameZh: "小丑", nameEn: "Joker", promptZh: "暖橙色与芥末黄色主调，冷蓝色对比，高对比度，暗部浓重，柯达 EXR 200T 胶片质感，压抑疯狂氛围" },
    { id: "cinema-86", collection: "cinema", nameZh: "爱乐之城", nameEn: "La La Land", promptZh: "高饱和度三原色，红色黄色蓝色大胆搭配，明亮鲜艳，梦幻浪漫，柔和高光，轻微胶片颗粒" },
    { id: "cinema-97", collection: "cinema", nameZh: "疯狂的麦克斯 4", nameEn: "Mad Max Fury Road", promptZh: "极致橙蓝对比，白天灼热橙黄色，夜晚冰冷蓝色，高对比度，高饱和度，狂野末日感" },
    { id: "cinema-98", collection: "cinema", nameZh: "黑客帝国矩阵", nameEn: "The Matrix", promptZh: "标志性绿色滤镜，模拟 80 年代单色显示器，高对比度，绿色偏色，数字质感，未来感" },
    { id: "cinema-99", collection: "cinema", nameZh: "柯达 Portra 400", nameEn: "Kodak Portra 400", promptZh: "人像黄金标准，肤色准确自然，暖色调，柔和高光，细腻阴影，轻微颗粒感" },
    { id: "cinema-110", collection: "cinema", nameZh: "柯达 Vision3 500T", nameEn: "Kodak Vision3 500T", promptZh: "电影胶片标准，浓郁肤色，青蓝色阴影，高对比度，低光表现优秀，好莱坞质感" },
    { id: "cinema-111", collection: "cinema", nameZh: "富士 Classic Chrome", nameEn: "Fujifilm Classic Chrome", promptZh: "低饱和度，柔和对比，复古感， muted colors，轻微褪色，适合街拍人文" },
    { id: "cinema-112", collection: "cinema", nameZh: "好莱坞电影感", nameEn: "Hollywood Cinematic", promptZh: "抛光工作室质感，柔和高光过渡，细腻阴影层次，肤色自然，轻微对比度提升，电影感" },
    { id: "cinema-113", collection: "cinema", nameZh: "90 年代复古", nameEn: "Retro 90s", promptZh: "轻微褪色效果，暖黄色调，对比度适中，胶片颗粒感，色彩饱和度略低，怀旧感" },
    { id: "cinema-114", collection: "cinema", nameZh: "镖人大漠主色调（官方定制）", nameEn: "Blades of the Guardians Desert Master", promptZh: "敦煌矿物颜料色调，土黄赭石沙黄为主基底，低饱和度高对比度，粗粝风沙颗粒质感，古铜色硬朗肤色，深黑色纯净暗部，氧化暗红色点缀，东方西部武侠美学，保留实景细节" },
    { id: "cinema-115", collection: "cinema", nameZh: "镖人残阳战斗场景", nameEn: "Blades of the Guardians Sunset Battle", promptZh: "残阳如血暖橙色调，黄沙漫天，冷暖对比强烈，高对比度，深黑阴影，刀刃反光锐利，血腥场面用暗红而非鲜红，悲壮史诗感，轻微动态模糊" },
    { id: "cinema-116", collection: "cinema", nameZh: "镖人夜晚客栈场景", nameEn: "Blades of the Guardians Night Inn", promptZh: "煤油灯暖黄色调，青灰色冷阴影，高对比度，暗部保留丰富细节，木质纹理清晰，烟雾缭绕质感，江湖烟火气，低饱和度" },
    { id: "cinema-117", collection: "cinema", nameZh: "镖人黑白漫画风格", nameEn: "Blades of the Guardians Manga Style", promptZh: "高对比度黑白灰，凌厉硬朗线条，粗犷笔触质感，深黑色块，亮白色高光，硬核武侠气质，刀光剑影效果，还原许先哲原著风格" },
    { id: "cinema-118", collection: "cinema", nameZh: "镖人雪山对决场景", nameEn: "Blades of the Guardians Snow Duel", promptZh: "冷青灰色调，白雪纯净，深黑色人物对比强烈，高对比度，凛冽寒风质感，刀光冰冷反光，孤独悲壮氛围，低饱和度" },
    { id: "cinema-119", collection: "cinema", nameZh: "镖人", nameEn: "镖人", promptZh: "《镖人》电影调色风格，敦煌矿物颜料色调，以土黄赭石为主基底，低饱和度高对比度，粗粝风沙质感，古铜色肤色，深黑色暗部，氧化暗红色点缀，轻微胶片颗粒，东方西部武侠美学" },
    { id: "cinema-120", collection: "cinema", nameZh: "镖人", nameEn: "镖人", promptZh: "镖人大漠场景调色，黄沙漫天，残阳如血，冷暖对比强烈，粗粝质感，高对比度，深黑阴影，轻微颗粒感，史诗感" },
] as const;

const CANVAS_LUT_IMAGE_PREVIEW_IDS = new Set([
    "guofeng-2",
    "guofeng-14",
    "guofeng-15",
    "cinema-2",
    "cinema-13",
    "cinema-24",
    "cinema-25",
    "cinema-26",
    "cinema-27",
    "cinema-28",
    "cinema-39",
    "cinema-40",
    "cinema-51",
    "cinema-52",
    "cinema-53",
    "cinema-64",
    "cinema-75",
    "cinema-86",
    "cinema-97",
    "cinema-98",
    "cinema-99",
    "cinema-110",
    "cinema-111",
    "cinema-113",
    "cinema-114",
    "cinema-115",
    "cinema-116",
    "cinema-117",
    "cinema-118",
    "cinema-119",
    "cinema-120",
]);

export function getCanvasLutPreviewUrl(id: string) {
    return CANVAS_LUT_IMAGE_PREVIEW_IDS.has(id) ? `/lut-previews/${id}.jpg` : undefined;
}

export function getCanvasLutPreviewPalette(preset: CanvasLutPreset): CanvasLutPreviewPalette {
    const description = `${preset.nameZh} ${preset.promptZh}`;
    const has = (...keywords: string[]) => keywords.some((keyword) => description.includes(keyword));
    let colors = {
        sky: "#b9b3a5",
        haze: "#d8c6a2",
        ground: "#736653",
        shadow: "#27231f",
        accent: "#d5a45a",
    };

    if (has("黑白灰", "黑白漫画")) {
        colors = { sky: "#d9d9d5", haze: "#f4f2ea", ground: "#777773", shadow: "#111111", accent: "#ffffff" };
    } else if (has("淡紫", "紫色", "九重紫")) {
        colors = { sky: "#c5bad8", haze: "#e8dff0", ground: "#776b86", shadow: "#2d2938", accent: "#d7b1cb" };
    } else if (has("粉色")) {
        colors = { sky: "#e6b5bc", haze: "#f3d7cd", ground: "#9b6975", shadow: "#3c2832", accent: "#e9bd73" };
    } else if (has("绿色滤镜", "绿色偏色")) {
        colors = { sky: "#789780", haze: "#aec1a0", ground: "#3f624c", shadow: "#102a1d", accent: "#b8d083" };
    } else if (has("淡蓝", "天青", "冷青", "青灰", "冷色调", "鸭卵青", "石青")) {
        colors = { sky: "#93abb0", haze: "#cad7d2", ground: "#526d6d", shadow: "#1e3034", accent: "#d7c69a" };
    } else if (has("暖红", "朱红", "绛红", "暗红", "残阳如血")) {
        colors = { sky: "#bd7658", haze: "#deb77d", ground: "#784238", shadow: "#2f2020", accent: "#d7a650" };
    } else if (has("暖橙", "橙黄色", "橙色", "残阳")) {
        colors = { sky: "#d58b4e", haze: "#e7bd79", ground: "#8c5738", shadow: "#33261f", accent: "#e2d0a1" };
    } else if (has("暖黄", "金色", "土黄", "棕褐", "茶褐", "赭石", "泛黄", "暖色调")) {
        colors = { sky: "#c9a76c", haze: "#e2d0a6", ground: "#7c6748", shadow: "#30291f", accent: "#b96b45" };
    }

    const saturation = has("黑白灰", "黑白漫画") ? 0 : has("高饱和度", "明艳", "浓郁") ? 1.2 : has("低饱和度", "淡雅", "褪色") ? 0.72 : 0.95;
    const contrast = has("高对比度", "对比强烈") ? 1.18 : has("低对比度", "柔和对比") ? 0.9 : 1;
    const brightness = has("暗黑", "压抑", "浓重暗部") ? 0.82 : has("明亮", "通透纯净") ? 1.08 : 1;

    return {
        ...colors,
        filter: `saturate(${saturation}) contrast(${contrast}) brightness(${brightness})`,
        grain: has("颗粒", "粗粝", "胶片", "古画", "水墨", "油画"),
    };
}

export function getCanvasLutPreset(id?: string) {
    return id ? CANVAS_LUT_PRESETS.find((preset) => preset.id === id) : undefined;
}

export function appendCanvasLutPrompt(prompt: string, presetId?: string, medium: "image" | "video" = "image") {
    const cleanPrompt = stripCanvasLutPrompt(prompt);
    const preset = getCanvasLutPreset(presetId);
    if (!preset) return cleanPrompt;
    const continuity =
        medium === "video"
            ? "Apply this color treatment consistently to every frame without flicker or shot-to-shot color drift."
            : "Apply this color treatment consistently across the entire image.";
    const lutPrompt = [
        "Color grading LUT requirements:",
        `${preset.nameZh} (${preset.nameEn}).`,
        preset.promptZh,
        continuity,
        "Treat these as color grading and finishing instructions only. Preserve the requested subjects, actions, composition, camera perspective and scene content; do not add text, color charts, LUT graphics, editing software or lighting equipment to the scene.",
    ].join(" ");
    return `${cleanPrompt}\n\n${lutPrompt}`.trim();
}

export function stripCanvasLutPrompt(prompt: string) {
    return prompt
        .replace(/\n{2}Color grading LUT requirements:[\s\S]*?(?=\n{2}Cinematography requirements:|$)/, "")
        .trim();
}
