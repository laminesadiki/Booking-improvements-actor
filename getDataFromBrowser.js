let categoriesElement = document.querySelector("div[class='v2_review-scores__body v2_review-scores__body--compared_to_average']");

let categoryList = [...categoriesElement.querySelectorAll("li")]

let CategoriesList  =categoryList.map( el => {
    let title = el.querySelector("span.c-score-bar__title").innerText;
    let score = el.querySelector("span.c-score-bar__score").innerText;
    return {[title] : score};

})

let categoriesObj = Object.assign({},...CategoriesList)

console.log(categoriesObj);