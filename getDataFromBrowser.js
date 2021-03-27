/******  Get ld data  ****** */
const ldElem = document.querySelector('script[type="application/ld+json"]').textContent;
const ld = JSON.parse(ldElem);
console.log(ld);

ld.hashMap = `https://maps.googleapis.com/maps/api/staticmap?size=1600x1200&center=31.0598989,-6.5959123&zoom=15&markers=color:blue%7c31.0598989,-6.5959123&sensor=false&client=gme-booking&channel=booking-frontend&signature=lqlXBaIcHRT2Ca6zqX3YycJkoM0=`


/******  Get Categories {title : score }  ****** */ 
let categoriesElement = document.querySelector("div[class='v2_review-scores__body v2_review-scores__body--compared_to_average']");

let categoryList = [...categoriesElement.querySelectorAll("li")]

let CategoriesList  =categoryList.map( el => {
    let title = el.querySelector("span.c-score-bar__title").innerText;
    let score = el.querySelector("span.c-score-bar__score").innerText;
    return {[title] : score};

})

let categoriesObj = Object.assign({},...CategoriesList)

console.log(categoriesObj);

/******  Get Stars  ****** */ 
let stars = document.querySelector("span.bui-rating").getAttribute("aria-label");
