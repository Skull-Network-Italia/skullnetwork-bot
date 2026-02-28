module.exports = async function handleWelcome(member) {
    const welcomeMessage = `
━━━━━━━━━━━━━━━━━━━━
👋 **Benvenuto/a in Skull Network Italia**  
━━━━━━━━━━━━━━━━━━━━

Ciao **${member.user.username}**,  
è un vero piacere accoglierti nella nostra **community multigaming**.  
Qui troverai uno spazio dedicato al rispetto, alla collaborazione e alla passione per il gioco. Che tu sia un veterano o un nuovo arrivato, il tuo contributo è importante per noi.

📌 Ti invitiamo a:
• Leggere attentamente il regolamento nel canale **#regolamento**  
• Presentarti alla community nel canale **#presentazioni**  
• Personalizzare il tuo profilo Discord e scegliere i ruoli se disponibili

Il nostro staff è sempre disponibile per qualsiasi domanda o supporto.

Ti auguriamo una splendida permanenza.  
Benvenuto in famiglia. 💀

━━━━━━━━━━━━━━━━━━━━

👋 **Welcome to Skull Network Italia**  
━━━━━━━━━━━━━━━━━━━━

Hi **${member.user.username}**,  
we're truly pleased to welcome you to our **multigaming community**.  
Here you’ll find a space built on respect, collaboration, and a shared love for gaming. Whether you're a veteran or a newcomer, your presence is valued.

📌 We invite you to:
• Carefully read the rules in **#rules**  
• Introduce yourself in **#introductions**  
• Personalize your Discord profile and select your roles if available

Our staff is always available for any questions or support.

We wish you a great experience.  
Welcome to the family. 💀
━━━━━━━━━━━━━━━━━━━━
`;

    try {
        await member.send(welcomeMessage);
        console.log(`✅ Messaggio di benvenuto inviato a ${member.user.tag}`);
    } catch (error) {
        console.error(`❌ Errore nell'invio del messaggio di benvenuto a ${member.user.tag}:`, error.message);
    }
};
