const puppeteer = require('puppeteer');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const token = '7545014405:AAGs6i9oAYngrtuvrdb37n9YYxqSQzPBQro'; // Замените на ваш токен бота
const bot = new TelegramBot(token, { polling: true });

let isRunning = false; // Флаг для проверки, работает ли бот
const repliedTasks = new Set();

async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
    console.log('Куки успешно сохранены в cookies.json');
}

async function loadCookies(page) {
    try {
        const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));
        await page.setCookie(...cookies);
        console.log('Куки успешно загружены из cookies.json');
    } catch (error) {
        console.error('Ошибка при загрузке куки:', error.message);
    }
}

async function checkAuthorization(page) {
    try {
        await page.waitForSelector('#ToolbarR .toolbar_userMenu__t0R_A', { timeout: 5000 });
        return true;
    } catch {
        console.error("Авторизация не прошла. Проверьте куки.");
        return false;
    }
}

async function fetchTasks(page) {
    await page.goto('https://youdo.com/tasks-all-opened-all', { waitUntil: 'networkidle2' });

    if (!(await checkAuthorization(page))) {
        console.log("Пожалуйста, авторизуйтесь в браузере...");
        await page.setDefaultTimeout(10000);
        await saveCookies(page);
    }

    await page.goto('https://youdo.com/tasks-all-opened-all', { waitUntil: 'networkidle2' });

    if (!(await checkAuthorization(page))) {
        console.error('Не удалось авторизоваться. Проверьте куки.');
        return [];
    }

    await page.waitForSelector('#Layout .TasksRedesignPage_tasksList__zl4w7 ul li', { timeout: 10000 });

    const tasks = await page.evaluate(() => {
        const taskElements = document.querySelectorAll('#Layout .TasksRedesignPage_tasksList__zl4w7 ul li');
        const tasks = [];

        taskElements.forEach((taskElement) => {
            const titleElement = taskElement.querySelector('.TasksList_title__oFe_x');
            const linkElement = taskElement.querySelector('a');

            if (titleElement && linkElement) {
                const title = titleElement.innerText.trim();
                const link = `https://youdo.com${linkElement.getAttribute('href')}`;
                tasks.push({ title, link });
            }
        });

        return tasks;
    });

    // Фильтруем задачи, на которые уже был отклик
    const newTasks = tasks.filter(task => !repliedTasks.has(task.link));

    console.log(`Найдено новых заданий: ${newTasks.length}`);
    return newTasks;
}

async function sendReply(task, page, chatId) {
    try {
        console.log(`Отправка отклика на задание: ${task.title} | Ссылка: ${task.link}`);
        await page.goto(task.link, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-blocks_wrapper > div.b-task-reactions.js-task-block-footer > div.js-task-item-actions > div > a', { timeout: 10000 });
        await page.click('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-blocks_wrapper > div.b-task-reactions.js-task-block-footer > div.js-task-item-actions > div > a');
        await page.waitForSelector('#DialogsQueue .wrapper__1144f.white__d3db2', { timeout: 10000 });

        await page.waitForSelector('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-block.b-task-block__header > div.b-task-block__header__price > span > span > span', { timeout: 10000 });
        const taskPriceText = await page.$eval('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-block.b-task-block__header > div.b-task-block__header__price > span > span > span', el => el.innerText);
        const taskPrice = parseFloat(taskPriceText.replace(/[^\d]/g, '')); // Удаляем все символы кроме цифр
        let offerPrice = Math.floor(taskPrice * 0.8); // На 20% меньше

        if (offerPrice < 1000) {
            offerPrice = 1000;
        }

        const priceInputSelector = '#DialogsQueue > div > div > div > div > div > div:nth-child(2) > div > div > div.inputWrapper__6df22 > div.wrapper__1144f.white__d3db2 > div:nth-child(1) > div.container__fc85b > div > input';
        const priceInput = await page.$(priceInputSelector);

        if (priceInput) {
            await priceInput.click({ clickCount: 3 }); // Выделяем текущее значение
            await priceInput.press('Backspace'); // Удаляем текущее значение
            await priceInput.type(offerPrice.toString()); // Вводим новую цену
        } else {
            console.error('Поле ввода цены не найдено');
        }

        const messageInputSelector = '#DialogsQueue > div > div > div > div > div > div:nth-child(3) > div > div > div > div.wrapper__1144f.white__d3db2 > div:nth-child(1) > div > div:nth-child(1) > div > textarea';
        await page.waitForSelector(messageInputSelector, { timeout: 10000 });
        await page.type(messageInputSelector, 'Всё в поисках достойного исполнителя? Хватит сёрфить! Ты уже нашел его. \n' +
            ' \n' +
            'Rise Studio - многопрофильная студия, готовая взять любой Ваш заказ под свое начало. Стильно, доступно, а главное в кратчайшие сроки - Всё это неотъемлемые условия нашей работы! \n' +
            '\n' +
            'По цене смогу сориентировать после точного ознакомления с техническим заданием. \n' +
            '\n' +
            'Портфолио - https://drive.google.com/drive/mobile/folders/1EChD65DnUW5iXJT-N_B-OWGb69uzOrIT\n' +
            '\n' +
            'Не плати оверпрайс, заказывай у Rise!');

        await page.click('#DialogsQueue .actions__629b0.actions__c7727 button');
        console.log(`Отклик отправлен на задание: ${task.title}`);
        await bot.sendMessage(chatId, `Отклик отправлен на задание: ${task.title}| Ссылка: ${task.link}`);
    } catch (error) {
        console.error(`Ошибка при отправке отклика на задание: ${task.title} | Ссылка: ${task.link}, error`);
    }
}

async function main(chatId) {
    if (isRunning) {
        console.log("Процесс уже запущен!");
        return;
    }

    isRunning = true; // Устанавливаем флаг, что процесс запущен
    const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await loadCookies(page); // Загружаем куки перед началом работы с заданиями
    const tasks = await fetchTasks(page); // Получаем задания с сайта

    if (tasks.length === 0) {
        console.log("Заданий не найдено. Ожидание перед перезапуском...");
        await page.setDefaultTimeout(30 * 1000); // Ждём 5 минут перед перезапуском
    } else {
        for (const task of tasks) {
            await sendReply(task, page, chatId);
        }
    }

    await browser.close();
    isRunning = false; // Сбрасываем флаг, процесс завершен

    // Перезапускаем функцию после паузы
    setTimeout(() => {
        main(chatId);
    }, 15 * 1000); // 1 минута ожидания перед следующим запуском
}
async function selectCategories(page) {
    try {
        // Переход на основную категорию
        await page.waitForSelector('#Layout > div > div.TasksRedesignPage_content__yUbel > div.TasksRedesignPage_categories__eixSG.TasksRedesignPage_categoriesSticky__giBGF > ul > li.Categories_item__Vxa16.Categories_all__v5GB0 > div > span', { timeout: 10000 });
        await page.click('#Layout > div > div.TasksRedesignPage_content__yUbel > div.TasksRedesignPage_categories__eixSG.TasksRedesignPage_categoriesSticky__giBGF > ul > li.Categories_item__Vxa16.Categories_all__v5GB0 > div > span');

        // Ожидание и выбор подкатегории "Виртуальный помощник"
        await page.waitForSelector('div.Checkbox_container__7ExBm.Categories_checkbox__HdW_K.Checkbox_mobileTransform__W6JhP > input[value="1048576"]', { timeout: 10000 });
        await page.click('div.Checkbox_container__7ExBm.Categories_checkbox__HdW_K.Checkbox_mobileTransform__W6JhP > input[value="1048576"] + span');
        console.log("Категория 'Виртуальный помощник' выбрана");
    } catch (error) {
        console.error('Ошибка при выборе категорий:', error);
    }
}

// Запуск функции выбора категорий по команде /disine
bot.onText(/\/disine/, async (msg) => {
    const chatId = msg.chat.id;
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Переход на главную страницу перед выбором категории
    await page.goto('https://youdo.com/tasks-all-opened-all', { waitUntil: 'networkidle2' });

    await selectCategories(page);

    await browser.close();
    bot.sendMessage(chatId, "Категория 'Дизайн' выбрана.");
});
// Команды для управления ботом
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Бот запущен. Используйте команды /run и /stop для управления.');
});

bot.onText(/\/run/, (msg) => {
    const chatId = msg.chat.id;
    if (isRunning) {
        bot.sendMessage(chatId, 'Процесс уже запущен!');
    } else {
        bot.sendMessage(chatId, 'Запуск процесса...');
        main(chatId).catch(error => bot.sendMessage(chatId, 'Ошибка в основном процессе: ' + error.message));
    }
});

bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    if (isRunning) {
        bot.sendMessage(chatId, 'Остановка процесса... (функция остановки не реализована)');
        // Можно реализовать логику для остановки процесса, если необходимо
        isRunning = false;
    } else {
        bot.sendMessage(chatId, 'Процесс не запущен.');
    }
});
