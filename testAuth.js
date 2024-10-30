const puppeteer = require('puppeteer');
const fs = require('fs');

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
        await page.waitForTimeout(10000); // Подождите, чтобы пользователь мог авторизоваться вручную
        await saveCookies(page); // Сохраняем куки после авторизации
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

    console.log(`Всего найдено заданий: ${tasks.length}`);
    return tasks;
}

async function sendReply(task, page) {
    try {
        console.log(`Отправка отклика на задание: ${task.title} | Ссылка: ${task.link}`);
        await page.goto(task.link, { waitUntil: 'networkidle2' });

        // Изменённый селектор для кнопки "Откликнуться"
        await page.waitForSelector('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-blocks_wrapper > div.b-task-reactions.js-task-block-footer > div.js-task-item-actions > div > a', { timeout: 10000 });
        await page.click('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-blocks_wrapper > div.b-task-reactions.js-task-block-footer > div.js-task-item-actions > div > a');
        await page.waitForSelector('#DialogsQueue .wrapper__1144f.white__d3db2', { timeout: 10000 });

        // Селектор для извлечения цены из заказа
        await page.waitForSelector('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-block.b-task-block__header > div.b-task-block__header__price > span > span > span', { timeout: 10000 });
        const taskPriceText = await page.$eval('#TaskContainer > div.layout-task__column.layout-task__column--left.i-reminder > div.b-task-blocks.b-task-item-base-info.js-task-item-base-info > div.b-task-block.b-task-block__header > div.b-task-block__header__price > span > span > span', el => el.innerText);

        // Извлекаем числовое значение из строки и удаляем лишние символы
        const taskPrice = parseFloat(taskPriceText.replace(/[^\d]/g, '')); // Удаляем все символы кроме цифр
        const offerPrice = Math.floor(taskPrice * 0.8); // На 20% меньше

        // Изменённый селектор для ввода цены
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
        await page.waitForSelector(messageInputSelector, { timeout: 10000 }); // Ожидаем, что элемент появится
        await page.type(messageInputSelector, 'Всё в поисках достойного исполнителя? Хватит сёрфить! Ты уже нашел его. \n' +
            ' \n' +
            'Rise Studio - многопрофильная студия, готовая взять любой Ваш заказ под свое начало. Стильно, доступно, а главное в кратчайшие сроки - Всё это неотъемлемые условия нашей работы! \n' +
            '\n' +
            'По цене смогу сориентировать после точного ознакомления с техническим заданием. \n' +
            '\n' +
            'Портфолио - https://drive.google.com/drive/mobile/folders/1EChD65DnUW5iXJT-N_B-OWGb69uzOrIT\n' +
            '\n' +
            'Не плати оверпрайс, заказывай у Rise!');

        // Нажимаем кнопку отправки сообщения
        await page.click('#DialogsQueue .actions__629b0.actions__c7727 button');
        console.log(`Отклик отправлен на задание: ${task.title}`);
    } catch (error) {
        console.error(`Ошибка при отправке отклика на задание: ${task.title} | Ссылка: ${task.link}`, error);
    }
}

// Основная функция для запуска обработки откликов
async function main() {
    const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await loadCookies(page); // Загружаем куки перед началом работы с заданиями
    const tasks = await fetchTasks(page); // получаем задания с сайта

    for (const task of tasks) {
        await sendReply(task, page);
    }

    await browser.close();
}

main().catch(error => console.error('Ошибка в основном процессе:', error));
