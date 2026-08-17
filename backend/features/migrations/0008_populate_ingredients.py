from django.db import migrations

INGREDIENTS = [
    # (name, category, default_unit)
    # Gemüse
    ("Tomate", "gemuese", "Stück"), ("Gurke", "gemuese", "Stück"), ("Zwiebel", "gemuese", "Stück"),
    ("Knoblauch", "gemuese", "Zehe"), ("Karotte", "gemuese", "Stück"), ("Kartoffel", "gemuese", "g"),
    ("Paprika (rot)", "gemuese", "Stück"), ("Paprika (gelb)", "gemuese", "Stück"),
    ("Paprika (grün)", "gemuese", "Stück"), ("Spinat", "gemuese", "g"), ("Babyspinat", "gemuese", "g"),
    ("Brokkoli", "gemuese", "g"), ("Blumenkohl", "gemuese", "g"), ("Zucchini", "gemuese", "Stück"),
    ("Aubergine", "gemuese", "Stück"), ("Champignons", "gemuese", "g"), ("Sellerie", "gemuese", "Stück"),
    ("Lauch", "gemuese", "Stange"), ("Ingwer", "gemuese", "cm"), ("Kürbis", "gemuese", "g"),
    ("Rote Bete", "gemuese", "Stück"), ("Spargel", "gemuese", "g"), ("Mais (Dose)", "gemuese", "Dose"),
    ("Eisbergsalat", "gemuese", "Kopf"), ("Frühlingszwiebeln", "gemuese", "Bund"),
    ("Süßkartoffel", "gemuese", "Stück"), ("Rucola", "gemuese", "g"), ("Erbsen (TK)", "gemuese", "g"),
    ("Pak Choi", "gemuese", "Stück"), ("Radieschen", "gemuese", "Bund"),
    # Obst
    ("Apfel", "obst", "Stück"), ("Banane", "obst", "Stück"), ("Orange", "obst", "Stück"),
    ("Zitrone", "obst", "Stück"), ("Limette", "obst", "Stück"), ("Erdbeere", "obst", "g"),
    ("Himbeere", "obst", "g"), ("Blaubeere", "obst", "g"), ("Mango", "obst", "Stück"),
    ("Avocado", "obst", "Stück"), ("Weintrauben", "obst", "g"), ("Kiwi", "obst", "Stück"),
    ("Ananas", "obst", "Stück"), ("Pfirsich", "obst", "Stück"), ("Birne", "obst", "Stück"),
    # Fleisch & Fisch
    ("Hähnchenbrust", "fleisch", "g"), ("Hähnchenschenkel", "fleisch", "g"),
    ("Rinderhackfleisch", "fleisch", "g"), ("Rindersteak", "fleisch", "g"),
    ("Schweinefilet", "fleisch", "g"), ("Speck", "fleisch", "g"), ("Lammhack", "fleisch", "g"),
    ("Lachsfilet", "fleisch", "g"), ("Thunfisch (Dose)", "fleisch", "Dose"),
    ("Garnelen", "fleisch", "g"), ("Kabeljaufilet", "fleisch", "g"), ("Forelle", "fleisch", "Stück"),
    # Milchprodukte
    ("Milch", "milch", "ml"), ("Butter", "milch", "g"), ("Sahne", "milch", "ml"),
    ("Joghurt", "milch", "g"), ("Käse (gerieben)", "milch", "g"), ("Mozzarella", "milch", "g"),
    ("Parmesan", "milch", "g"), ("Quark", "milch", "g"), ("Ei", "milch", "Stück"),
    ("Crème fraîche", "milch", "g"), ("Frischkäse", "milch", "g"), ("Schmand", "milch", "g"),
    ("Feta", "milch", "g"),
    # Getreide & Backwaren
    ("Weizenmehl", "getreide", "g"), ("Zucker", "getreide", "g"), ("Hefe", "getreide", "g"),
    ("Backpulver", "getreide", "TL"), ("Haferflocken", "getreide", "g"),
    ("Weißreis", "getreide", "g"), ("Basmatireis", "getreide", "g"),
    ("Spaghetti", "getreide", "g"), ("Penne", "getreide", "g"), ("Tagliatelle", "getreide", "g"),
    ("Fusilli", "getreide", "g"), ("Couscous", "getreide", "g"), ("Paniermehl", "getreide", "g"),
    ("Toastbrot", "getreide", "Scheibe"), ("Vollkornbrot", "getreide", "Scheibe"),
    ("Bulgur", "getreide", "g"), ("Quinoa", "getreide", "g"),
    # Hülsenfrüchte
    ("Kichererbsen (Dose)", "huelsenfruechte", "Dose"), ("Linsen (braun)", "huelsenfruechte", "g"),
    ("Linsen (rot)", "huelsenfruechte", "g"), ("Kidneybohnen (Dose)", "huelsenfruechte", "Dose"),
    ("Weiße Bohnen (Dose)", "huelsenfruechte", "Dose"), ("Sojabohnen", "huelsenfruechte", "g"),
    ("Edamame", "huelsenfruechte", "g"),
    # Gewürze & Kräuter
    ("Salz", "gewuerze", "TL"), ("Pfeffer (schwarz)", "gewuerze", "TL"),
    ("Paprikapulver", "gewuerze", "TL"), ("Paprikapulver (scharf)", "gewuerze", "TL"),
    ("Kreuzkümmel", "gewuerze", "TL"), ("Curry", "gewuerze", "TL"),
    ("Oregano", "gewuerze", "TL"), ("Thymian", "gewuerze", "TL"), ("Rosmarin", "gewuerze", "TL"),
    ("Basilikum", "gewuerze", "TL"), ("Petersilie (frisch)", "gewuerze", "Bund"),
    ("Schnittlauch", "gewuerze", "Bund"), ("Chili (gemahlen)", "gewuerze", "TL"),
    ("Chiliflocken", "gewuerze", "TL"), ("Lorbeerblatt", "gewuerze", "Stück"),
    ("Koriander (gemahlen)", "gewuerze", "TL"), ("Muskatnuss", "gewuerze", "Prise"),
    ("Zimt", "gewuerze", "TL"), ("Kurkuma", "gewuerze", "TL"), ("Kardamom", "gewuerze", "TL"),
    ("Knoblauchpulver", "gewuerze", "TL"), ("Zwiebelpulver", "gewuerze", "TL"),
    # Öle & Fette
    ("Olivenöl", "oele", "EL"), ("Sonnenblumenöl", "oele", "EL"),
    ("Rapsöl", "oele", "EL"), ("Kokosfett", "oele", "EL"), ("Sesamöl", "oele", "TL"),
    ("Butterschmalz", "oele", "EL"),
    # Saucen & Konserven
    ("Tomatenmark", "saucen", "EL"), ("Passierte Tomaten", "saucen", "ml"),
    ("Gehackte Tomaten (Dose)", "saucen", "Dose"), ("Kokosmilch", "saucen", "ml"),
    ("Gemüsebrühe", "saucen", "ml"), ("Hühnerbrühe", "saucen", "ml"),
    ("Rinderbrühe", "saucen", "ml"), ("Sojasoße", "saucen", "EL"),
    ("Worcestershiresauce", "saucen", "TL"), ("Balsamico-Essig", "saucen", "EL"),
    ("Weißweinessig", "saucen", "EL"), ("Senf", "saucen", "TL"),
    ("Mayonnaise", "saucen", "EL"), ("Ketchup", "saucen", "EL"), ("Tabasco", "saucen", "Tropfen"),
    ("Fischsoße", "saucen", "EL"), ("Tahini", "saucen", "EL"),
    # Sonstiges
    ("Honig", "sonstiges", "EL"), ("Ahornsirup", "sonstiges", "EL"),
    ("Zitronensaft", "sonstiges", "EL"), ("Schokolade (dunkel)", "sonstiges", "g"),
    ("Mandeln", "sonstiges", "g"), ("Walnüsse", "sonstiges", "g"),
    ("Cashews", "sonstiges", "g"), ("Sonnenblumenkerne", "sonstiges", "EL"),
    ("Chia-Samen", "sonstiges", "EL"), ("Vanilleextrakt", "sonstiges", "TL"),
    ("Stärke", "sonstiges", "EL"), ("Weißwein", "sonstiges", "ml"),
    ("Rotwein", "sonstiges", "ml"), ("Panko", "sonstiges", "g"),
    ("Hoisin-Sauce", "sonstiges", "EL"), ("Misopaste", "sonstiges", "EL"),
]


def populate(apps, schema_editor):
    Ingredient = apps.get_model('features', 'Ingredient')
    Ingredient.objects.bulk_create(
        [Ingredient(name=n, category=c, default_unit=u) for n, c, u in INGREDIENTS],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [('features', '0007_ingredient_catalog')]
    operations = [migrations.RunPython(populate, migrations.RunPython.noop)]
