fn main() {
    use regex::Regex;

    // Create a regex pattern to match email addresses
    // let email_re = Regex::new(r"^[(kubernetes\.core\.k8s)|(kubernetes\.core\.helm)|(kubernetes\.core\.helm_plugin)|(kubernetes\.core\.helm_repository)|(onepassword\.connect\..*)]$").unwrap();
    // let email_re = Regex::new(r"^kubernetes\.core\.k8s$").unwrap();
    let email_re = Regex::new(r"^(i(kubernetes\.core\.k8s)|(kubernetes\.core\.helm))$").unwrap();

    // Test some email addresses
    let test_emails = vec!["kubernetes.core.k8s", "kubernetes.core.k8s_hoge"];

    for email in test_emails {
        if email_re.is_match(email) {
            println!("{} is a valid email address", email);
        } else {
            println!("{} is NOT a valid email address", email);
        }
    }
}
